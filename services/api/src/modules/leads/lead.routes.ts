import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../../config/env';
import { prisma } from '../../db/prisma';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { pagination, parse, phoneSchema, rupeesToPaise } from '../../lib/http';
import { currentUser, requireAuth } from '../../middleware/auth';
import { userSummarySelect } from '../users/user.select';
import { findReferrerByCode } from '../referrals/referral.service';
import { LEAD_TRANSITIONS } from './lead.service';

export const leadRouter = Router();

const productType = z.enum(['loan', 'credit_card', 'insurance']);
const leadStatus = z.enum(['new', 'contacted', 'in_progress', 'converted', 'rejected']);

const leadInput = z.object({
  productType,
  leadName: z.string().trim().min(2).max(100),
  leadPhone: phoneSchema,
  notes: z.string().trim().max(1000).optional(),
  dealAmount: rupeesToPaise.optional(),
});

async function assertNoDuplicate(leadPhone: string, productType: string) {
  const dup = await prisma.lead.findFirst({
    where: {
      leadPhone,
      productType: productType as never,
      status: { in: ['new', 'contacted', 'in_progress'] },
    },
    select: { id: true },
  });
  if (dup) throw badRequest('This person already has an open lead for this product');
}

/** Public lead capture from a shared referral link. */
leadRouter.post(
  '/public',
  rateLimit({ windowMs: 60 * 60 * 1000, limit: env.NODE_ENV === 'test' ? 10_000 : 20, standardHeaders: 'draft-7', legacyHeaders: false }),
  async (req, res) => {
    const body = parse(leadInput.omit({ dealAmount: true }).extend({ referralCode: z.string().trim().min(4).max(16) }), req.body);
    const referrer = await findReferrerByCode(body.referralCode);
    if (!referrer) throw badRequest('Invalid referral code');
    await assertNoDuplicate(body.leadPhone, body.productType);
    const lead = await prisma.lead.create({
      data: {
        referredByUserId: referrer.id,
        productType: body.productType,
        leadName: body.leadName,
        leadPhone: body.leadPhone,
        notes: body.notes,
      },
      select: { id: true, status: true, createdAt: true },
    });
    res.status(201).json(lead);
  },
);

leadRouter.use(requireAuth);

leadRouter.post('/', async (req, res) => {
  const body = parse(leadInput, req.body);
  await assertNoDuplicate(body.leadPhone, body.productType);
  const lead = await prisma.lead.create({
    data: {
      referredByUserId: currentUser(req).id,
      productType: body.productType,
      leadName: body.leadName,
      leadPhone: body.leadPhone,
      notes: body.notes,
      dealAmountPaise: body.dealAmount,
    },
  });
  res.status(201).json(lead);
});

/** Affiliates see their own leads; admins see all and may filter by referrer. */
leadRouter.get('/', async (req, res) => {
  const me = currentUser(req);
  const q = parse(
    z.object({
      status: leadStatus.optional(),
      productType: productType.optional(),
      referrerId: z.string().uuid().optional(),
      search: z.string().trim().max(100).optional(),
    }),
    req.query,
  );
  const { page, pageSize, skip, take } = pagination(req);
  const where = {
    referredByUserId: me.role === 'admin' ? q.referrerId : me.id,
    status: q.status,
    productType: q.productType,
    ...(q.search
      ? { OR: [{ leadName: { contains: q.search, mode: 'insensitive' as const } }, { leadPhone: { contains: q.search } }] }
      : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.lead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: { referredBy: { select: userSummarySelect } },
    }),
    prisma.lead.count({ where }),
  ]);
  res.json({ items, total, page, pageSize });
});

leadRouter.get('/stats', async (req, res) => {
  const grouped = await prisma.lead.groupBy({
    by: ['status'],
    where: { referredByUserId: currentUser(req).id },
    _count: { _all: true },
  });
  const counts = Object.fromEntries(Object.keys(LEAD_TRANSITIONS).map((s) => [s, 0]));
  for (const g of grouped) counts[g.status] = g._count._all;
  res.json(counts);
});

leadRouter.get('/:id', async (req, res) => {
  const me = currentUser(req);
  const lead = await prisma.lead.findUnique({
    where: { id: parse(z.string().uuid(), req.params.id) },
    include: {
      referredBy: { select: userSummarySelect },
      commissions: { select: { id: true, userId: true, tier: true, amountPaise: true, status: true } },
    },
  });
  if (!lead) throw notFound('Lead not found');
  if (me.role !== 'admin' && lead.referredByUserId !== me.id) throw forbidden();
  res.json({
    ...lead,
    // Affiliates only see their own commission rows on a lead, not their upline's.
    commissions: me.role === 'admin' ? lead.commissions : lead.commissions.filter((c) => c.userId === me.id),
    allowedTransitions: LEAD_TRANSITIONS[lead.status],
  });
});
