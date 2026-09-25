import crypto from 'node:crypto';
import { env } from '../config/env';

/**
 * Swappable KYC provider contract. Real implementations (Digio, Karza/Perfios,
 * Signzy, HyperVerge) wrap their HTTP APIs behind these four calls.
 */
export interface KycProvider {
  readonly name: string;
  /** Starts Aadhaar OTP eKYC. The raw Aadhaar number must never be persisted by the caller. */
  aadhaarSendOtp(aadhaarNumber: string): Promise<{ refId: string }>;
  aadhaarVerifyOtp(refId: string, otp: string): Promise<{ verified: boolean; name?: string; verificationId?: string }>;
  verifyPan(pan: string, name?: string): Promise<{ verified: boolean; registeredName?: string }>;
  /** Penny-drop (or equivalent) bank account verification. */
  verifyBank(accountNumber: string, ifsc: string): Promise<{ verified: boolean; nameAtBank?: string }>;
}

export const MOCK_AADHAAR_OTP = env.TEST_OTP ?? '1234';

/**
 * Development provider. Aadhaar OTP is TEST_OTP (default 1234); PAN/bank pass when well-formed.
 * PANs whose 5th character is "X" and accounts ending in "0000" fail, to exercise error paths.
 */
class MockKycProvider implements KycProvider {
  readonly name = 'mock';
  private pending = new Map<string, string>();

  async aadhaarSendOtp(aadhaarNumber: string) {
    const refId = `mock_${crypto.randomUUID()}`;
    this.pending.set(refId, aadhaarNumber.slice(-4));
    console.log(`[kyc:mock] Aadhaar OTP for ref ${refId}: ${MOCK_AADHAAR_OTP}`);
    return { refId };
  }

  async aadhaarVerifyOtp(refId: string, otp: string) {
    if (!refId.startsWith('mock_') || otp !== MOCK_AADHAAR_OTP) return { verified: false };
    this.pending.delete(refId);
    return { verified: true, name: 'Mock Aadhaar Holder', verificationId: refId.replace('mock_', 'aadhaar_') };
  }

  async verifyPan(pan: string, name?: string) {
    const verified = pan[4] !== 'X';
    return { verified, registeredName: verified ? (name ?? 'Mock PAN Holder') : undefined };
  }

  async verifyBank(accountNumber: string) {
    const verified = !accountNumber.endsWith('0000');
    return { verified, nameAtBank: verified ? 'Mock Account Holder' : undefined };
  }
}

function create(): KycProvider {
  switch (env.KYC_PROVIDER) {
    case 'mock':
      return new MockKycProvider();
    default:
      throw new Error(
        `KYC_PROVIDER=${env.KYC_PROVIDER} has no adapter yet. Implement KycProvider in src/providers/kyc.ts.`,
      );
  }
}

export const kyc: KycProvider = create();
