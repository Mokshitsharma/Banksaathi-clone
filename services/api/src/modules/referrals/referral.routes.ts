import { Router } from 'express';
import { z } from 'zod';
import { notFound } from '../../lib/errors';
import { parse } from '../../lib/http';
import { currentUser, requireAuth } from '../../middleware/auth';
import { ensureReferralLink, findReferrerByCode, getDownline, referralUrl } from './referral.service';

export const referralRouter = Router();

/** Public: lets a landing page / signup screen validate a code and show who invited you. */
referralRouter.get('/code/:code', async (req, res) => {
  const referrer = await findReferrerByCode(String(req.params.code));
  if (!referrer) throw notFound('Referral code not found');
  res.json({ code: String(req.params.code).toUpperCase(), referrerName: referrer.name });
});

referralRouter.get('/link', requireAuth, async (req, res) => {
  const link = await ensureReferralLink(currentUser(req).id);
  res.json({ id: link.id, code: link.code, url: referralUrl(link.code), createdAt: link.createdAt });
});

referralRouter.get('/downline', requireAuth, async (req, res) => {
  const { depth } = parse(z.object({ depth: z.coerce.number().int().min(1).max(10).default(3) }), req.query);
  const members = await getDownline(currentUser(req).id, depth);
  res.json({
    members,
    counts: members.reduce<Record<number, number>>((acc, m) => ({ ...acc, [m.level]: (acc[m.level] ?? 0) + 1 }), {}),
  });
});
