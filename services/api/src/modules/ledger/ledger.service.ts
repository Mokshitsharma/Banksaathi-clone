import { Prisma, type LedgerType } from '@prisma/client';
import { prisma, type Tx } from '../../db/prisma';
import { badRequest } from '../../lib/errors';

interface AppendInput {
  userId: string;
  type: LedgerType;
  /** Signed paise: positive credits, negative debits. */
  amountPaise: number;
  referenceId: string;
  description?: string;
}

/**
 * Appends an immutable ledger entry. Must run inside a transaction: the user row is
 * locked so concurrent credits/debits for the same user serialise and balances stay exact.
 */
export async function appendLedgerEntry(tx: Tx, input: AppendInput) {
  await lockUser(tx, input.userId);
  const balance = await getBalance(input.userId, tx);
  const balanceAfter = balance + input.amountPaise;
  if (balanceAfter < 0) throw badRequest('Insufficient balance');
  return tx.ledgerEntry.create({
    data: { ...input, balanceAfterPaise: balanceAfter },
  });
}

/**
 * Row-locks the user for the rest of the transaction. Call this BEFORE inserting rows that
 * reference the user (their FK takes a share lock, and upgrading it later can deadlock).
 */
export async function lockUser(tx: Tx, userId: string) {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`);
}

export async function getBalance(userId: string, tx: Tx = prisma): Promise<number> {
  const agg = await tx.ledgerEntry.aggregate({ where: { userId }, _sum: { amountPaise: true } });
  return agg._sum.amountPaise ?? 0;
}
