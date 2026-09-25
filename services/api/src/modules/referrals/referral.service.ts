import { Prisma } from '@prisma/client';
import { env } from '../../config/env';
import { prisma, type Tx } from '../../db/prisma';
import { randomCode } from '../../lib/crypto';

export function referralUrl(code: string) {
  return `${env.REFERRAL_BASE_URL.replace(/\/$/, '')}/${code}`;
}

/** Returns the user's referral link, creating one with a unique code if missing. */
export async function ensureReferralLink(userId: string, tx: Tx = prisma) {
  const existing = await tx.referralLink.findUnique({ where: { userId } });
  if (existing) return existing;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode(8);
    const clash = await tx.referralLink.findUnique({ where: { code } });
    if (!clash) return tx.referralLink.create({ data: { userId, code } });
  }
  throw new Error('Could not generate a unique referral code');
}

export async function findReferrerByCode(code: string, tx: Tx = prisma) {
  const link = await tx.referralLink.findUnique({
    where: { code: code.trim().toUpperCase() },
    include: { user: { select: { id: true, name: true } } },
  });
  return link?.user ?? null;
}

export interface DownlineRow {
  id: string;
  name: string | null;
  phone: string;
  level: number;
  kycStatus: string;
  createdAt: Date;
  leadsCount: number;
}

/** Everyone below `userId` in the referral tree, down to `maxDepth` levels. */
export async function getDownline(userId: string, maxDepth: number): Promise<DownlineRow[]> {
  return prisma.$queryRaw<DownlineRow[]>(Prisma.sql`
    WITH RECURSIVE tree AS (
      SELECT id, name, phone, kyc_status, created_at, 1 AS level
      FROM users WHERE referred_by = ${userId}::uuid
      UNION ALL
      SELECT u.id, u.name, u.phone, u.kyc_status, u.created_at, t.level + 1
      FROM users u JOIN tree t ON u.referred_by = t.id
      WHERE t.level < ${maxDepth}
    )
    SELECT t.id, t.name, t.phone, t.level, t.kyc_status::text AS "kycStatus", t.created_at AS "createdAt",
           (SELECT COUNT(*)::int FROM leads l WHERE l.referred_by_user_id = t.id) AS "leadsCount"
    FROM tree t
    ORDER BY t.level, t.created_at DESC
  `);
}

/** Upline chain starting at `userId` (index 0 = userId itself), up to `depth` entries. */
export async function getUplineChain(tx: Tx, userId: string, depth: number): Promise<string[]> {
  const chain: string[] = [];
  let current: string | null = userId;
  const seen = new Set<string>();
  while (current && chain.length < depth && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    const next: { referredById: string | null } | null = await tx.user.findUnique({
      where: { id: current },
      select: { referredById: true },
    });
    current = next?.referredById ?? null;
  }
  return chain;
}
