import type { LeadStatus, ProductType } from '@refera/shared-types';

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

export const money = (paise: number | null | undefined) => inr.format((paise ?? 0) / 100);

export const date = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export const PRODUCT_LABEL: Record<ProductType, string> = {
  loan: 'Loan',
  credit_card: 'Credit card',
  insurance: 'Insurance',
};

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  in_progress: 'In progress',
  converted: 'Converted',
  rejected: 'Rejected',
};
