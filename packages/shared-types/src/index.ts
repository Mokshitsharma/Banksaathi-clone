// Shared API contracts. All money values are integer paise (1 INR = 100 paise).
// Consumers MUST use `import type` — this package has no runtime code.

export type Role = 'affiliate' | 'admin';
export type KycStatus = 'unverified' | 'pending' | 'verified' | 'rejected';
export type ProductType = 'loan' | 'credit_card' | 'insurance';
export type LeadStatus = 'new' | 'contacted' | 'in_progress' | 'converted' | 'rejected';
export type CommissionType = 'flat' | 'percent';
export type CommissionStatus = 'pending' | 'approved' | 'paid' | 'rejected';
export type PayoutStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type LedgerType = 'commission_credit' | 'payout_debit' | 'payout_reversal';
export type KycDocumentType = 'pan_card' | 'bank_proof' | 'other';

export interface User {
  id: string;
  phone: string;
  email: string | null;
  name: string | null;
  role: Role;
  referredById: string | null;
  kycStatus: KycStatus;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
  isNewUser: boolean;
}

export interface ReferralLink {
  id: string;
  code: string;
  url: string;
  createdAt: string;
}

export interface Lead {
  id: string;
  referredByUserId: string;
  productType: ProductType;
  leadName: string;
  leadPhone: string;
  status: LeadStatus;
  dealAmountPaise: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  referredBy?: Pick<User, 'id' | 'name' | 'phone'>;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DownlineMember {
  id: string;
  name: string | null;
  phone: string;
  level: number;
  kycStatus: KycStatus;
  createdAt: string;
  leadsCount: number;
}

export interface CommissionRule {
  id: string;
  productType: ProductType;
  commissionType: CommissionType;
  /** flat: paise. percent: basis points (100 bp = 1%). */
  value: number;
  tier: number;
  active: boolean;
  createdAt: string;
}

export interface Commission {
  id: string;
  leadId: string;
  userId: string;
  ruleId: string | null;
  tier: number;
  amountPaise: number;
  status: CommissionStatus;
  createdAt: string;
  lead?: Pick<Lead, 'id' | 'leadName' | 'productType'>;
  user?: Pick<User, 'id' | 'name' | 'phone'>;
}

export interface Payout {
  id: string;
  userId: string;
  amountPaise: number;
  status: PayoutStatus;
  payoutMethod: string;
  transactionRef: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  user?: Pick<User, 'id' | 'name' | 'phone'>;
}

export interface LedgerEntry {
  id: string;
  userId: string;
  type: LedgerType;
  amountPaise: number;
  balanceAfterPaise: number;
  referenceId: string;
  description: string | null;
  createdAt: string;
}

export interface EarningsSummary {
  pendingPaise: number;
  approvedPaise: number;
  paidPaise: number;
  inProcessPayoutPaise: number;
  availableBalancePaise: number;
  totalEarnedPaise: number;
}

export interface KycState {
  kycStatus: KycStatus;
  aadhaarVerified: boolean;
  panVerified: boolean;
  bankVerified: boolean;
  panMasked: string | null;
  bankAccountMasked: string | null;
  bankIfsc: string | null;
  rejectionReason: string | null;
  documents: KycDocument[];
}

export interface KycDocument {
  id: string;
  type: KycDocumentType;
  fileName: string;
  createdAt: string;
  url?: string;
}

export interface AdminAnalytics {
  users: { total: number; last30Days: number; kycVerified: number };
  leadsByStatus: Record<LeadStatus, number>;
  commissions: { pendingPaise: number; approvedPaise: number; paidOutPaise: number };
  payouts: { pendingCount: number; processingCount: number };
  kycPendingReview: number;
}

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}
