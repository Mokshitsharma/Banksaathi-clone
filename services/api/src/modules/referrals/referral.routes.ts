import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../../config/env';
import { mask } from '../../lib/crypto';
import { notFound } from '../../lib/errors';
import { parse } from '../../lib/http';
import { currentUser, requireAuth } from '../../middleware/auth';
import { ensureReferralLink, findReferrerByCode, getDownline, referralUrl } from './referral.service';

export const referralRouter = Router();

const codeLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.NODE_ENV === 'test' ? 10_000 : 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

/** Public: lets a landing page / signup screen validate a code and show who invited you. */
referralRouter.get('/code/:code', codeLookupLimiter, async (req, res) => {
  const code = parse(z.string().trim().regex(/^[A-Za-z0-9]{4,16}$/, 'Invalid referral code'), req.params.code);
  const referrer = await findReferrerByCode(code);
  if (!referrer) throw notFound('Referral code not found');
  res.json({ code: code.toUpperCase(), referrerName: referrer.name });
});

referralRouter.get('/link', requireAuth, async (req, res) => {
  const link = await ensureReferralLink(currentUser(req).id);
  res.json({ id: link.id, code: link.code, url: referralUrl(link.code), createdAt: link.createdAt });
});

referralRouter.get('/downline', requireAuth, async (req, res) => {
  const { depth } = parse(z.object({ depth: z.coerce.number().int().min(1).max(10).default(3) }), req.query);
  const members = (await getDownline(currentUser(req).id, depth)).map((m) => ({
    ...m,
    // You invited level-1 members yourself; deeper levels are other people's contacts, so hide their numbers.
    phone: m.level === 1 ? m.phone : mask(m.phone, 4),
  }));
  res.json({
    members,
    counts: members.reduce<Record<number, number>>((acc, m) => ({ ...acc, [m.level]: (acc[m.level] ?? 0) + 1 }), {}),
  });
});
