import type { Offer, ProductType } from '@refera/shared-types';
import { money, PRODUCT_LABEL } from './format';

const DEAL_BASIS: Record<ProductType, string> = {
  loan: 'the loan amount',
  credit_card: 'the card value',
  insurance: 'the premium',
};

export const isTeamBonus = (o: Offer) => o.tier > 1;

/** The payout itself, e.g. "₹1,500" or "1%". */
export function offerAmount(o: Offer) {
  return o.commissionType === 'flat' ? money(o.value) : `${(o.value / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`;
}

/** What the amount is paid on, e.g. "per approved card" or "of the loan amount". */
export function offerBasis(o: Offer) {
  const noun = o.productType === 'insurance' ? 'policy' : o.productType === 'loan' ? 'disbursed loan' : 'approved card';
  return o.commissionType === 'flat' ? `per ${noun}` : `of ${DEAL_BASIS[o.productType]}`;
}

/** Admin-written title, or a generated one when the rule has no copy yet. */
export function offerTitle(o: Offer) {
  if (o.title) return o.title;
  const product = PRODUCT_LABEL[o.productType];
  return isTeamBonus(o) ? `${product} team bonus` : `Refer a ${product.toLowerCase()}, earn ${offerAmount(o)}`;
}

export function offerTierLabel(o: Offer) {
  if (!isTeamBonus(o)) return 'Direct referral';
  return o.tier === 2 ? 'Team bonus' : `Team bonus · level ${o.tier}`;
}

export function offerFallbackDescription(o: Offer) {
  if (!isTeamBonus(o)) return `Earn ${offerAmount(o)} ${offerBasis(o)} when someone you refer converts.`;
  const who = o.tier === 2 ? 'someone you invited' : `a level-${o.tier} member of your team`;
  return `Earn ${offerAmount(o)} ${offerBasis(o)} whenever ${who} converts a ${PRODUCT_LABEL[o.productType].toLowerCase()} lead.`;
}
