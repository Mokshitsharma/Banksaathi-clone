import type {
  AuthResponse,
  Commission,
  DownlineMember,
  EarningsSummary,
  KycDocumentType,
  KycState,
  Lead,
  LeadStatus,
  LedgerEntry,
  Paginated,
  Payout,
  ProductType,
  ReferralLink,
  User,
} from '@refera/shared-types';
import { api } from './client';

export type LeadDetail = Lead & {
  allowedTransitions: LeadStatus[];
  commissions: Pick<Commission, 'id' | 'userId' | 'tier' | 'amountPaise' | 'status'>[];
};

export const Auth = {
  sendOtp: (phone: string) => api.post<{ sent: boolean; expiresInSeconds: number }>('/auth/otp/send', { phone }).then((r) => r.data),
  verifyOtp: (body: { phone: string; otp: string; referralCode?: string; name?: string }) =>
    api.post<AuthResponse>('/auth/otp/verify', body).then((r) => r.data),
  checkReferralCode: (code: string) =>
    api.get<{ code: string; referrerName: string | null }>(`/referrals/code/${encodeURIComponent(code)}`).then((r) => r.data),
};

export const Me = {
  get: () => api.get<User>('/me').then((r) => r.data),
  update: (body: { name?: string; email?: string }) => api.patch<User>('/me', body).then((r) => r.data),
  registerDevice: (token: string, platform: 'android' | 'ios') => api.post('/me/devices', { token, platform }),
};

export const Referrals = {
  link: () => api.get<ReferralLink>('/referrals/link').then((r) => r.data),
  downline: (depth = 3) =>
    api.get<{ members: DownlineMember[]; counts: Record<number, number> }>('/referrals/downline', { params: { depth } }).then((r) => r.data),
};

export const Leads = {
  list: (params: { status?: LeadStatus; page?: number; search?: string }) =>
    api.get<Paginated<Lead>>('/leads', { params }).then((r) => r.data),
  stats: () => api.get<Record<LeadStatus, number>>('/leads/stats').then((r) => r.data),
  get: (id: string) => api.get<LeadDetail>(`/leads/${id}`).then((r) => r.data),
  create: (body: { productType: ProductType; leadName: string; leadPhone: string; notes?: string; dealAmount?: number }) =>
    api.post<Lead>('/leads', body).then((r) => r.data),
};

export const Earnings = {
  summary: () => api.get<EarningsSummary & { minPayoutPaise: number }>('/earnings/summary').then((r) => r.data),
  ledger: (page = 1) => api.get<Paginated<LedgerEntry>>('/earnings/ledger', { params: { page } }).then((r) => r.data),
  commissions: (page = 1) => api.get<Paginated<Commission>>('/earnings/commissions', { params: { page } }).then((r) => r.data),
  payouts: (page = 1) => api.get<Paginated<Payout>>('/earnings/payouts', { params: { page } }).then((r) => r.data),
  requestPayout: (amountRupees: number) => api.post<Payout>('/earnings/payouts', { amount: amountRupees }).then((r) => r.data),
};

export const Kyc = {
  get: () => api.get<KycState>('/kyc').then((r) => r.data),
  aadhaarOtp: (aadhaarNumber: string) => api.post('/kyc/aadhaar/otp', { aadhaarNumber }).then((r) => r.data),
  aadhaarVerify: (otp: string) => api.post<KycState>('/kyc/aadhaar/verify', { otp }).then((r) => r.data),
  pan: (pan: string, name?: string) => api.post<KycState>('/kyc/pan', { pan, name }).then((r) => r.data),
  bank: (accountNumber: string, ifsc: string) => api.post<KycState>('/kyc/bank', { accountNumber, ifsc }).then((r) => r.data),
  uploadDocument: (type: KycDocumentType, file: { uri: string; name: string; mimeType: string }) => {
    const form = new FormData();
    form.append('type', type);
    // React Native's FormData accepts { uri, name, type } file descriptors.
    form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
    return api.post('/kyc/documents', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
  },
};
