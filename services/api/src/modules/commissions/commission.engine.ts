import type { CommissionRule, Lead } from '@prisma/client';
import type { Tx } from '../../db/prisma';
import { badRequest } from '../../lib/errors';
import { getUplineChain } from '../referrals/referral.service';

/** Pure calculation: flat rules pay `value` paise; percent rules pay `value` basis points of the deal. */
export function calculateAmount(rule: Pick<CommissionRule, 'commissionType' | 'value'>, dealAmountPaise: number | null) {
  if (rule.commissionType === 'flat') return rule.value;
  if (dealAmountPaise == null) return null;
  return Math.floor((dealAmountPaise * rule.value) / 10_000);
}

/**
 * Creates pending commissions for a freshly converted lead. Tier 1 goes to the direct
 * referrer, tier 2 to their upline, and so on — one commission per matching active rule.
 */
export async function createCommissionsForLead(tx: Tx, lead: Pick<Lead, 'id' | 'productType' | 'referredByUserId' | 'dealAmountPaise'>) {
  const rules = await tx.commissionRule.findMany({
    where: { productType: lead.productType, active: true },
    orderBy: { tier: 'asc' },
  });
  if (rules.length === 0) return [];

  if (lead.dealAmountPaise == null && rules.some((r) => r.commissionType === 'percent')) {
    throw badRequest('dealAmount is required to convert this lead because a percentage commission rule applies');
  }

  const maxTier = Math.max(...rules.map((r) => r.tier));
  const chain = await getUplineChain(tx, lead.referredByUserId, maxTier);

  const created = [];
  for (const rule of rules) {
    const beneficiary = chain[rule.tier - 1];
    const amount = calculateAmount(rule, lead.dealAmountPaise);
    if (!beneficiary || !amount || amount <= 0) continue;
    created.push(
      await tx.commission.upsert({
        where: { leadId_userId_tier: { leadId: lead.id, userId: beneficiary, tier: rule.tier } },
        update: {},
        create: { leadId: lead.id, userId: beneficiary, ruleId: rule.id, tier: rule.tier, amountPaise: amount },
      }),
    );
  }
  return created;
}
