import { describe, expect, it } from 'vitest';
import { calculateAmount } from '../src/modules/commissions/commission.engine';
import { canTransition } from '../src/modules/leads/lead.service';

describe('calculateAmount', () => {
  it('pays flat rules regardless of deal size', () => {
    expect(calculateAmount({ commissionType: 'flat', value: 150000 }, null)).toBe(150000);
  });
  it('pays basis points of the deal for percent rules, rounding down', () => {
    // 1% of ₹5,00,000.55
    expect(calculateAmount({ commissionType: 'percent', value: 100 }, 50_000_055)).toBe(500_000);
  });
  it('returns null for percent rules without a deal amount', () => {
    expect(calculateAmount({ commissionType: 'percent', value: 100 }, null)).toBeNull();
  });
});

describe('lead pipeline', () => {
  it('only allows forward transitions', () => {
    expect(canTransition('new', 'contacted')).toBe(true);
    expect(canTransition('contacted', 'in_progress')).toBe(true);
    expect(canTransition('in_progress', 'converted')).toBe(true);
    expect(canTransition('new', 'converted')).toBe(false);
    expect(canTransition('converted', 'rejected')).toBe(false);
    expect(canTransition('rejected', 'new')).toBe(false);
  });
});
