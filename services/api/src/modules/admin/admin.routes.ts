import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { notFound } from '../../lib/errors';
import { pagination, parse, rupeesToPaise } from '../../lib/http';
import { requireAuth, requireRole } from '../../middleware/auth';
import { approveCommission, rejectCommission } from '../commissions/commission.service';
import { approveKyc, kycState, rejectKyc } from '../kyc/kyc.service';
import { updateLeadStatus } from '../leads/lead.service';
import { markCompleted, markFailed, markProcessing } from '../payouts/payout.service';
import { getBalance } from '../ledger/ledger.service';
import { publicUserSelect, userSummarySelect } from '../users/user.select';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('admin'));

const uuid = z.string().uuid();
const productType = z.enum(['loan', 'credit_card', 'insurance']);

// ---------- Analytics ----------
adminRouter.get('/analytics', async (_req, res) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [total, last30Days, kycVerified, kycPendingReview, leadGroups, commissionGroups, payoutGroups, signupsRaw] =
    await Promise.all([
      prisma.user.count({ where: { role: 'affiliate' } }),
      prisma.user.count({ where: { role: 'affiliate', createdAt: { gte: since } } }),
      prisma.user.count({ where: { role: 'affiliate', kycStatus: 'verified' } }),
      prisma.user.count({ where: { kycStatus: 'pending' } }),
      prisma.lead.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.commission.groupBy({ by: ['status'], _sum: { amountPaise: true } }),
      prisma.payout.groupBy({ by: ['status'], _count: { _all: true }, _sum: { amountPaise: true } }),
      prisma.$queryRaw<{ day: Date; count: number }[]>`
        SELECT date_trunc('day', created_at) AS day, COUNT(*)::int AS count
        FROM users WHERE role = 'affiliate' AND created_at >= ${since}
        GROUP BY 1 ORDER BY 1`,
    ]);
  const leadsByStatus = { new: 0, contacted: 0, in_progress: 0, converted: 0, rejected: 0 } as Record<string, number>;
  for (const g of leadGroups) leadsByStatus[g.status] = g._count._all;
  const cSum = (s: string) => commissionGroups.find((g) => g.status === s)?._sum.amountPaise ?? 0;
  const pGroup = (s: string) => payoutGroups.find((g) => g.status === s);

  res.json({
    users: { total, last30Days, kycVerified },
    leadsByStatus,
    commissions: { pendingPaise: cSum('pending'), approvedPaise: cSum('approved') + cSum('paid'), paidOutPaise: pGroup('completed')?._sum.amountPaise ?? 0 },
    payouts: { pendingCount: pGroup('pending')?._count._all ?? 0, processingCount: pGroup('processing')?._count._all ?? 0 },
    kycPendingReview,
    signupsByDay: signupsRaw.map((r) => ({ day: r.day.toISOString().slice(0, 10), count: r.count })),
  });
});

// ---------- Users ----------
adminRouter.get('/users', async (req, res) => {
  const q = parse(
    z.object({
      search: z.string().trim().max(100).optional(),
      kycStatus: z.enum(['unverified', 'pending', 'verified', 'rejected']).optional(),
      role: z.enum(['affiliate', 'admin']).optional(),
    }),
    req.query,
  );
  const { page, pageSize, skip, take } = pagination(req);
  const where = {
    role: q.role,
    kycStatus: q.kycStatus,
    ...(q.search
      ? { OR: [{ name: { contains: q.search, mode: 'insensitive' as const } }, { phone: { contains: q.search } }, { email: { contains: q.search, mode: 'insensitive' as const } }] }
      : {}),
  };
  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: { ...publicUserSelect, referredBy: { select: userSummarySelect }, _count: { select: { leads: true, referrals: true } } },
    }),
    prisma.user.count({ where }),
  ]);
  res.json({ items: users, total, page, pageSize });
});

adminRouter.get('/users/:id', async (req, res) => {
  const id = parse(uuid, req.params.id);
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      ...publicUserSelect,
      referredBy: { select: userSummarySelect },
      referralLink: { select: { code: true } },
      _count: { select: { leads: true, referrals: true } },
    },
  });
  if (!user) throw notFound('User not found');
  res.json({ ...user, balancePaise: await getBalance(id) });
});

// ---------- Leads ----------
adminRouter.patch('/leads/:id/status', async (req, res) => {
  const body = parse(
    z.object({
      status: z.enum(['new', 'contacted', 'in_progress', 'converted', 'rejected']),
      dealAmount: rupeesToPaise.optional(),
      notes: z.string().trim().max(1000).optional(),
    }),
    req.body,
  );
  const result = await updateLeadStatus(parse(uuid, req.params.id), {
    status: body.status,
    dealAmountPaise: body.dealAmount,
    notes: body.notes,
  });
  res.json(result);
});

// ---------- KYC review ----------
adminRouter.get('/kyc', async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['unverified', 'pending', 'verified', 'rejected']).default('pending') }), req.query);
  const { page, pageSize, skip, take } = pagination(req);
  const where = { kycStatus: status, role: 'affiliate' as const };
  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      orderBy: { updatedAt: 'asc' },
      skip,
      take,
      select: {
        ...publicUserSelect,
        kycRecord: { select: { aadhaarVerified: true, panVerified: true, bankVerified: true, panMasked: true, bankAccountMasked: true, bankIfsc: true, nameAsPerKyc: true, updatedAt: true } },
        _count: { select: { kycDocuments: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);
  res.json({ items, total, page, pageSize });
});

adminRouter.get('/kyc/:userId', async (req, res) => {
  const userId = parse(uuid, req.params.userId);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: publicUserSelect });
  if (!user) throw notFound('User not found');
  res.json({ user, kyc: await kycState(userId) });
});

adminRouter.post('/kyc/:userId/approve', async (req, res) => {
  await approveKyc(parse(uuid, req.params.userId));
  res.json({ ok: true });
});

adminRouter.post('/kyc/:userId/reject', async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(500) }), req.body);
  await rejectKyc(parse(uuid, req.params.userId), reason);
  res.json({ ok: true });
});

// ---------- Commission rules ----------
const ruleInput = z
  .object({
    productType,
    commissionType: z.enum(['flat', 'percent']),
    /** flat: rupees; percent: percentage (e.g. 1.5 for 1.5%). Converted to paise / basis points. */
    value: z.coerce.number().positive(),
    tier: z.coerce.number().int().min(1).max(10).default(1),
    active: z.boolean().default(true),
  })
  .transform((r) => ({ ...r, value: Math.round(r.value * 100) }))
  .refine((r) => r.commissionType === 'flat' || r.value <= 10_000, { message: 'Percentage cannot exceed 100%', path: ['value'] });

adminRouter.get('/commission-rules', async (_req, res) => {
  res.json(await prisma.commissionRule.findMany({ orderBy: [{ productType: 'asc' }, { tier: 'asc' }] }));
});

adminRouter.post('/commission-rules', async (req, res) => {
  res.status(201).json(await prisma.commissionRule.create({ data: parse(ruleInput, req.body) }));
});

adminRouter.patch('/commission-rules/:id', async (req, res) => {
  const partial = parse(
    z.object({
      commissionType: z.enum(['flat', 'percent']).optional(),
      value: z.coerce.number().positive().transform((v) => Math.round(v * 100)).optional(),
      tier: z.coerce.number().int().min(1).max(10).optional(),
      active: z.boolean().optional(),
    }),
    req.body,
  );
  res.json(await prisma.commissionRule.update({ where: { id: parse(uuid, req.params.id) }, data: partial }));
});

adminRouter.delete('/commission-rules/:id', async (req, res) => {
  await prisma.commissionRule.delete({ where: { id: parse(uuid, req.params.id) } });
  res.status(204).end();
});

// ---------- Commissions ----------
adminRouter.get('/commissions', async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['pending', 'approved', 'paid', 'rejected']).optional() }), req.query);
  const { page, pageSize, skip, take } = pagination(req);
  const where = { status };
  const [items, total] = await prisma.$transaction([
    prisma.commission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: { lead: { select: { id: true, leadName: true, productType: true, dealAmountPaise: true } }, user: { select: userSummarySelect } },
    }),
    prisma.commission.count({ where }),
  ]);
  res.json({ items, total, page, pageSize });
});

adminRouter.post('/commissions/:id/approve', async (req, res) => {
  res.json(await approveCommission(parse(uuid, req.params.id)));
});

adminRouter.post('/commissions/:id/reject', async (req, res) => {
  res.json(await rejectCommission(parse(uuid, req.params.id)));
});

// ---------- Payouts ----------
adminRouter.get('/payouts', async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['pending', 'processing', 'completed', 'failed']).optional() }), req.query);
  const { page, pageSize, skip, take } = pagination(req);
  const where = { status };
  const [items, total] = await prisma.$transaction([
    prisma.payout.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      skip,
      take,
      include: { user: { select: { ...userSummarySelect, kycRecord: { select: { bankAccountMasked: true, bankIfsc: true } } } } },
    }),
    prisma.payout.count({ where }),
  ]);
  res.json({ items, total, page, pageSize });
});

adminRouter.post('/payouts/:id/process', async (req, res) => {
  res.json(await markProcessing(parse(uuid, req.params.id)));
});

adminRouter.post('/payouts/:id/complete', async (req, res) => {
  const { transactionRef } = parse(z.object({ transactionRef: z.string().trim().min(3).max(100) }), req.body);
  res.json(await markCompleted(parse(uuid, req.params.id), transactionRef));
});

adminRouter.post('/payouts/:id/fail', async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(300) }), req.body);
  res.json(await markFailed(parse(uuid, req.params.id), reason));
});
