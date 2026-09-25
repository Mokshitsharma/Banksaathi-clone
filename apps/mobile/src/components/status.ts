import type { CommissionStatus, KycStatus, LeadStatus, PayoutStatus } from '@refera/shared-types';
import type { Tone } from './ui';

export const leadTone: Record<LeadStatus, Tone> = {
  new: 'info',
  contacted: 'primary',
  in_progress: 'warning',
  converted: 'success',
  rejected: 'danger',
};

export const commissionTone: Record<CommissionStatus, Tone> = {
  pending: 'warning',
  approved: 'primary',
  paid: 'success',
  rejected: 'danger',
};

export const payoutTone: Record<PayoutStatus, Tone> = {
  pending: 'warning',
  processing: 'info',
  completed: 'success',
  failed: 'danger',
};

export const kycTone: Record<KycStatus, Tone> = {
  unverified: 'neutral',
  pending: 'warning',
  verified: 'success',
  rejected: 'danger',
};

export const KYC_LABEL: Record<KycStatus, string> = {
  unverified: 'Not verified',
  pending: 'Under review',
  verified: 'Verified',
  rejected: 'Action needed',
};
