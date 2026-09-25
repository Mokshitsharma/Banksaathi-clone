import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { prisma } from '../../db/prisma';
import { pagination, parse, rupeesToPaise } from '../../lib/http';
import { currentUser, requireAuth } from '../../middleware/auth';
import { getBalance } from '../ledger/ledger.service';
import { requestPayout } from '../payouts/payout.service';

export const earningsRouter = Router();
earningsRouter.use(requireAuth);

earningsRouter.get('/summary', async (req, res) => {
  const userId = currentUser(req).id;
  const [byStatus, payouts, balance] = await Promise.all([
    prisma.commission.groupBy({ by: ['status'], where: { userId }, _sum: { amountPaise: true } }),
    prisma.payout.groupBy({ by: ['status'], where: { userId }, _sum: { amountPaise: true } }),
    getBalance(userId),
  ]);
  const c = (s: string) => byStatus.find((g) => g.status === s)?._sum.amountPaise ?? 0;
  const p = (s: string) => payouts.find((g) => g.status === s)?._sum.amountPaise ?? 0;
  res.json({
    pendingPaise: c('pending'),
    approvedPaise: c('approved'),
    paidPaise: p('completed'),
    inProcessPayoutPaise: p('pending') + p('processing'),
    availableBalancePaise: balance,
    totalEarnedPaise: c('approved') + c('paid'),
    minPayoutPaise: env.MIN_PAYOUT_PAISE,
  });
});

earningsRouter.get('/commissions', async (req, res) => {
  const userId = currentUser(req).id;
  const { status } = parse(z.object({ status: z.enum(['pending', 'approved', 'paid', 'rejected']).optional() }), req.query);
  const { page, pageSize, skip, take } = pagination(req);
  const where = { userId, status };
  const [items, total] = await prisma.$transaction([
    prisma.commission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: { lead: { select: { id: true, leadName: true, productType: true } } },
    }),
    prisma.commission.count({ where }),
  ]);
  res.json({ items, total, page, pageSize });
});

earningsRouter.get('/ledger', async (req, res) => {
  const userId = currentUser(req).id;
  const { page, pageSize, skip, take } = pagination(req);
  const [items, total] = await prisma.$transaction([
    prisma.ledgerEntry.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.ledgerEntry.count({ where: { userId } }),
  ]);
  res.json({ items, total, page, pageSize });
});

earningsRouter.get('/payouts', async (req, res) => {
  const userId = currentUser(req).id;
  const { page, pageSize, skip, take } = pagination(req);
  const [items, total] = await prisma.$transaction([
    prisma.payout.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.payout.count({ where: { userId } }),
  ]);
  res.json({ items, total, page, pageSize });
});

earningsRouter.post('/payouts', async (req, res) => {
  const { amount } = parse(z.object({ amount: rupeesToPaise }), req.body);
  const payout = await requestPayout(currentUser(req).id, amount);
  res.status(201).json(payout);
});
