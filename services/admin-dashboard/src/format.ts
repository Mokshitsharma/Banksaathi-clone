import type { CommissionStatus, KycStatus, LeadStatus, PayoutStatus, ProductType } from '@refera/shared-types';

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
export const money = (paise: number | null | undefined) => inr.format((paise ?? 0) / 100);
export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export const PRODUCT_LABEL: Record<ProductType, string> = { loan: 'Loan', credit_card: 'Credit card', insurance: 'Insurance' };
export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  in_progress: 'In progress',
  converted: 'Converted',
  rejected: 'Rejected',
};

type Tone = 'neutral' | 'info' | 'primary' | 'success' | 'warning' | 'danger';
export const tone = {
  lead: { new: 'info', contacted: 'primary', in_progress: 'warning', converted: 'success', rejected: 'danger' } as Record<LeadStatus, Tone>,
  commission: { pending: 'warning', approved: 'primary', paid: 'success', rejected: 'danger' } as Record<CommissionStatus, Tone>,
  payout: { pending: 'warning', processing: 'info', completed: 'success', failed: 'danger' } as Record<PayoutStatus, Tone>,
  kyc: { unverified: 'neutral', pending: 'warning', verified: 'success', rejected: 'danger' } as Record<KycStatus, Tone>,
};
