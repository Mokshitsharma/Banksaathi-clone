import type { PayoutStatus } from '@prisma/client';
import { env } from '../../config/env';
import { prisma, type Tx } from '../../db/prisma';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { notifyUser } from '../../providers/push';
import { appendLedgerEntry, lockUser } from '../ledger/ledger.service';

const rupees = (paise: number) => `₹${(paise / 100).toFixed(2)}`;

/** The requested amount is debited from the ledger immediately so it can't be withdrawn twice. */
export async function requestPayout(userId: string, amountPaise: number) {
  if (amountPaise < env.MIN_PAYOUT_PAISE) throw badRequest(`Minimum payout is ${rupees(env.MIN_PAYOUT_PAISE)}`);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { kycStatus: true, kycRecord: { select: { bankAccountMasked: true } } },
  });
  if (user.kycStatus !== 'verified') throw forbidden('Complete KYC verification before requesting a payout');

  return prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const payout = await tx.payout.create({
      data: { userId, amountPaise, payoutMethod: `bank_transfer:${user.kycRecord?.bankAccountMasked ?? 'unknown'}` },
    });
    await appendLedgerEntry(tx, {
      userId,
      type: 'payout_debit',
      amountPaise: -amountPaise,
      referenceId: payout.id,
      description: 'Payout requested',
    });
    return payout;
  });
}

async function transition(tx: Tx, id: string, from: PayoutStatus[], data: { status: PayoutStatus; transactionRef?: string; failureReason?: string }) {
  const { count } = await tx.payout.updateMany({ where: { id, status: { in: from } }, data });
  if (count === 0) {
    const p = await tx.payout.findUnique({ where: { id }, select: { status: true } });
    if (!p) throw notFound('Payout not found');
    throw badRequest(`Payout is ${p.status}; expected one of: ${from.join(', ')}`);
  }
  return tx.payout.findUniqueOrThrow({ where: { id } });
}

export async function markProcessing(id: string) {
  const payout = await prisma.$transaction((tx) => transition(tx, id, ['pending'], { status: 'processing' }));
  notifyUser(payout.userId, { title: 'Payout processing', body: `Your payout of ${rupees(payout.amountPaise)} is being processed.`, data: { type: 'payout', payoutId: id } });
  return payout;
}

export async function markCompleted(id: string, transactionRef: string) {
  const payout = await prisma.$transaction(async (tx) => {
    const p = await transition(tx, id, ['pending', 'processing'], { status: 'completed', transactionRef });
    await settleCommissions(tx, p.userId);
    return p;
  });
  notifyUser(payout.userId, { title: 'Payout sent', body: `${rupees(payout.amountPaise)} has been sent to your bank account.`, data: { type: 'payout', payoutId: id } });
  return payout;
}

/** A failed payout returns the money to the affiliate's balance via a reversal entry. */
export async function markFailed(id: string, reason: string) {
  const payout = await prisma.$transaction(async (tx) => {
    const p = await transition(tx, id, ['pending', 'processing'], { status: 'failed', failureReason: reason });
    await appendLedgerEntry(tx, {
      userId: p.userId,
      type: 'payout_reversal',
      amountPaise: p.amountPaise,
      referenceId: p.id,
      description: `Payout failed: ${reason}`,
    });
    return p;
  });
  notifyUser(payout.userId, { title: 'Payout failed', body: `${rupees(payout.amountPaise)} was returned to your balance. ${reason}`, data: { type: 'payout', payoutId: id } });
  return payout;
}

/** Marks approved commissions as paid, oldest first, up to the total amount actually paid out. */
async function settleCommissions(tx: Tx, userId: string) {
  const [paidOut, alreadySettled, approved] = await Promise.all([
    tx.payout.aggregate({ where: { userId, status: 'completed' }, _sum: { amountPaise: true } }),
    tx.commission.aggregate({ where: { userId, status: 'paid' }, _sum: { amountPaise: true } }),
    tx.commission.findMany({ where: { userId, status: 'approved' }, orderBy: { createdAt: 'asc' }, select: { id: true, amountPaise: true } }),
  ]);
  let budget = (paidOut._sum.amountPaise ?? 0) - (alreadySettled._sum.amountPaise ?? 0);
  const toSettle: string[] = [];
  for (const c of approved) {
    if (c.amountPaise > budget) break;
    budget -= c.amountPaise;
    toSettle.push(c.id);
  }
  if (toSettle.length) await tx.commission.updateMany({ where: { id: { in: toSettle } }, data: { status: 'paid' } });
}
