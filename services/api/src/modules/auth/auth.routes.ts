import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../../config/env';
import { prisma } from '../../db/prisma';
import { randomOtp, safeEqual, sha256 } from '../../lib/crypto';
import { badRequest, forbidden, tooMany, unauthorized } from '../../lib/errors';
import { parse, phoneSchema } from '../../lib/http';
import { currentUser, requireAuth, signToken } from '../../middleware/auth';
import { sms } from '../../providers/sms';
import { publicUserSelect } from '../users/user.select';
import { ensureReferralLink, findReferrerByCode } from '../referrals/referral.service';

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.NODE_ENV === 'test' ? 10_000 : 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});
authRouter.use(authLimiter);

const RESEND_COOLDOWN_MS = 30_000;
const MAX_OTPS_PER_HOUR = 5;

const hashOtp = (phone: string, otp: string) => sha256(`${phone}:${otp}:${env.JWT_SECRET}`);

/**
 * Phone-level lockout: wrong guesses are counted across every OTP issued to the phone within the
 * lockout window, so requesting a fresh OTP does not reset the budget.
 */
async function assertNotLockedOut(phone: string) {
  const windowStart = new Date(Date.now() - env.OTP_LOCKOUT_MINUTES * 60 * 1000);
  const recent = await prisma.otpCode.findMany({
    where: { phone, createdAt: { gt: windowStart }, attempts: { gt: 0 } },
    select: { attempts: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const failures = recent.reduce((sum, r) => sum + r.attempts, 0);
  if (failures >= env.OTP_MAX_ATTEMPTS) {
    const unlockAt = recent[0].createdAt.getTime() + env.OTP_LOCKOUT_MINUTES * 60 * 1000;
    const minutes = Math.max(1, Math.ceil((unlockAt - Date.now()) / 60_000));
    throw tooMany(`Too many incorrect OTP attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
  }
}

authRouter.post('/otp/send', async (req, res) => {
  const { phone } = parse(z.object({ phone: phoneSchema }), req.body);
  await assertNotLockedOut(phone);

  const recent = await prisma.otpCode.findMany({
    where: { phone, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (recent[0] && Date.now() - recent[0].createdAt.getTime() < RESEND_COOLDOWN_MS) {
    throw tooMany('Please wait 30 seconds before requesting another OTP');
  }
  if (recent.length >= MAX_OTPS_PER_HOUR) throw tooMany('Too many OTP requests. Try again later.');

  const otp = env.TEST_OTP ?? randomOtp();
  await prisma.$transaction([
    // Retire older codes but keep their attempt counts (they feed the lockout window).
    prisma.otpCode.updateMany({ where: { phone, consumed: false }, data: { consumed: true } }),
    prisma.otpCode.create({
      data: { phone, codeHash: hashOtp(phone, otp), expiresAt: new Date(Date.now() + env.OTP_TTL_SECONDS * 1000) },
    }),
  ]);
  await sms.sendOtp(phone, otp);

  res.json({ sent: true, expiresInSeconds: env.OTP_TTL_SECONDS });
});

authRouter.post('/otp/verify', async (req, res) => {
  const body = parse(
    z.object({
      phone: phoneSchema,
      otp: z.string().regex(/^\d{4,6}$/, 'Enter the OTP you received'),
      referralCode: z.string().trim().min(4).max(16).optional(),
      name: z.string().trim().min(1).max(100).optional(),
    }),
    req.body,
  );

  await assertNotLockedOut(body.phone);
  const record = await prisma.otpCode.findFirst({
    where: { phone: body.phone, consumed: false },
    orderBy: { createdAt: 'desc' },
  });
  if (!record || record.expiresAt < new Date()) throw unauthorized('OTP expired. Request a new one.');

  // Reserve an attempt atomically BEFORE comparing, so parallel guesses can't exceed the limit.
  const reserved = await prisma.otpCode.updateMany({
    where: { id: record.id, consumed: false, attempts: { lt: env.OTP_MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (reserved.count === 0) throw tooMany('Too many incorrect OTP attempts. Request a new OTP later.');

  if (!safeEqual(record.codeHash, hashOtp(body.phone, body.otp))) throw unauthorized('Incorrect OTP');

  // Success: consume the code and give back the reserved attempt so it doesn't count as a failure.
  const consumed = await prisma.otpCode.updateMany({
    where: { id: record.id, consumed: false },
    data: { consumed: true, attempts: { decrement: 1 } },
  });
  if (consumed.count === 0) throw unauthorized('OTP already used. Request a new one.');

  const existing = await prisma.user.findUnique({ where: { phone: body.phone }, select: { ...publicUserSelect, tokenVersion: true } });
  // Admins must use email + password so a phone/SIM compromise can't grant admin access.
  if (existing?.role === 'admin') throw forbidden('Admin accounts sign in with email and password on the admin panel');

  let user = existing;
  if (!user) {
    const referrer = body.referralCode ? await findReferrerByCode(body.referralCode) : null;
    if (body.referralCode && !referrer) throw badRequest('Invalid referral code');
    user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { phone: body.phone, name: body.name, referredById: referrer?.id },
        select: { ...publicUserSelect, tokenVersion: true },
      });
      await ensureReferralLink(created.id, tx);
      return created;
    });
  }

  const { tokenVersion, ...publicUser } = user;
  res.json({ token: signToken({ ...publicUser, tokenVersion }), user: publicUser, isNewUser: !existing });
});

/**
 * Per-account password guessing limit, independent of IP: 10 failed logins per email per 15 minutes.
 * Successful logins don't count. In-memory store (per process).
 */
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `admin-login:${String(req.body?.email ?? '').trim().toLowerCase()}`,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many failed sign-in attempts for this account. Try again in 15 minutes.' } },
});

authRouter.post('/admin/login', adminLoginLimiter, async (req, res) => {
  const { email, password } = parse(
    z.object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(1).max(200) }),
    req.body,
  );
  const admin = await prisma.user.findUnique({ where: { email } });
  const ok = admin?.role === 'admin' && admin.passwordHash && (await bcrypt.compare(password, admin.passwordHash));
  if (!admin || !ok) throw unauthorized('Invalid email or password');

  const user = await prisma.user.findUniqueOrThrow({ where: { id: admin.id }, select: publicUserSelect });
  res.json({ token: signToken({ ...user, tokenVersion: admin.tokenVersion }), user, isNewUser: false });
});

/** Signs the user out everywhere by invalidating every token issued so far. */
authRouter.post('/logout', requireAuth, async (req, res) => {
  await prisma.user.update({ where: { id: currentUser(req).id }, data: { tokenVersion: { increment: 1 } } });
  res.status(204).end();
});
