import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../../config/env';
import { prisma } from '../../db/prisma';
import { randomOtp, safeEqual, sha256 } from '../../lib/crypto';
import { badRequest, tooMany, unauthorized } from '../../lib/errors';
import { parse, phoneSchema } from '../../lib/http';
import { signToken } from '../../middleware/auth';
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

authRouter.post('/otp/send', async (req, res) => {
  const { phone } = parse(z.object({ phone: phoneSchema }), req.body);

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

  const record = await prisma.otpCode.findFirst({
    where: { phone: body.phone, consumed: false },
    orderBy: { createdAt: 'desc' },
  });
  if (!record || record.expiresAt < new Date()) throw unauthorized('OTP expired. Request a new one.');
  if (record.attempts >= env.OTP_MAX_ATTEMPTS) throw unauthorized('Too many wrong attempts. Request a new OTP.');

  if (!safeEqual(record.codeHash, hashOtp(body.phone, body.otp))) {
    await prisma.otpCode.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
    throw unauthorized('Incorrect OTP');
  }
  await prisma.otpCode.update({ where: { id: record.id }, data: { consumed: true } });

  let user = await prisma.user.findUnique({ where: { phone: body.phone }, select: publicUserSelect });
  const isNewUser = !user;
  if (!user) {
    const referrer = body.referralCode ? await findReferrerByCode(body.referralCode) : null;
    if (body.referralCode && !referrer) throw badRequest('Invalid referral code');
    user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { phone: body.phone, name: body.name, referredById: referrer?.id },
        select: publicUserSelect,
      });
      await ensureReferralLink(created.id, tx);
      return created;
    });
  }

  res.json({ token: signToken(user), user, isNewUser });
});

authRouter.post('/admin/login', async (req, res) => {
  const { email, password } = parse(
    z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) }),
    req.body,
  );
  const admin = await prisma.user.findUnique({ where: { email } });
  const ok = admin?.role === 'admin' && admin.passwordHash && (await bcrypt.compare(password, admin.passwordHash));
  if (!admin || !ok) throw unauthorized('Invalid email or password');

  const user = await prisma.user.findUniqueOrThrow({ where: { id: admin.id }, select: publicUserSelect });
  res.json({ token: signToken(user), user, isNewUser: false });
});
