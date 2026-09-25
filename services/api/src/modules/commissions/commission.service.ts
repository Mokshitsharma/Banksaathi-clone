import { prisma } from '../../db/prisma';
import { badRequest, notFound } from '../../lib/errors';
import { notifyUser } from '../../providers/push';
import { appendLedgerEntry } from '../ledger/ledger.service';

const rupees = (paise: number) => `₹${(paise / 100).toFixed(2)}`;

/** Approving a commission credits the affiliate's ledger, making it withdrawable. */
export async function approveCommission(id: string) {
  const commission = await prisma.$transaction(async (tx) => {
    const { count } = await tx.commission.updateMany({ where: { id, status: 'pending' }, data: { status: 'approved' } });
    if (count === 0) {
      const exists = await tx.commission.findUnique({ where: { id }, select: { status: true } });
      if (!exists) throw notFound('Commission not found');
      throw badRequest(`Commission is already ${exists.status}`);
    }
    const c = await tx.commission.findUniqueOrThrow({ where: { id }, include: { lead: { select: { leadName: true } } } });
    await appendLedgerEntry(tx, {
      userId: c.userId,
      type: 'commission_credit',
      amountPaise: c.amountPaise,
      referenceId: c.id,
      description: `Commission (tier ${c.tier}) for ${c.lead.leadName}`,
    });
    return c;
  });
  notifyUser(commission.userId, {
    title: 'Commission approved',
    body: `${rupees(commission.amountPaise)} is now available to withdraw.`,
    data: { type: 'commission', commissionId: commission.id },
  });
  return commission;
}

export async function rejectCommission(id: string) {
  const { count } = await prisma.commission.updateMany({ where: { id, status: 'pending' }, data: { status: 'rejected' } });
  if (count === 0) throw badRequest('Only pending commissions can be rejected');
  return prisma.commission.findUniqueOrThrow({ where: { id } });
}
