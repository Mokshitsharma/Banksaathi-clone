import { describe, expect, it } from 'vitest';
import { parseEnv } from '../src/config/env';

const base = {
  DATABASE_URL: 'postgresql://x:y@localhost:5432/db',
  JWT_SECRET: 'a'.repeat(40),
  DATA_ENCRYPTION_KEY: 'ab'.repeat(32),
};
const prod = { ...base, NODE_ENV: 'production', CORS_ORIGINS: 'https://admin.refera.app', KYC_PROVIDER: 'digio' };

const errorsOf = (raw: Record<string, string | undefined>) => {
  const r = parseEnv(raw);
  return r.ok ? [] : r.errors;
};

describe('2. TEST_OTP production guard', () => {
  it('allows TEST_OTP only with an explicit development/test NODE_ENV', () => {
    expect(parseEnv({ ...base, NODE_ENV: 'development', TEST_OTP: '1234' }).ok).toBe(true);
    expect(parseEnv({ ...base, NODE_ENV: 'test', TEST_OTP: '1234' }).ok).toBe(true);
  });

  it('refuses TEST_OTP when NODE_ENV is missing (would otherwise default to development)', () => {
    expect(errorsOf({ ...base, TEST_OTP: '1234' }).join()).toMatch(/TEST_OTP/);
    expect(errorsOf({ ...base, NODE_ENV: '', TEST_OTP: '1234' }).length).toBeGreaterThan(0);
  });

  it('refuses TEST_OTP in production', () => {
    expect(errorsOf({ ...prod, TEST_OTP: '1234' }).join()).toMatch(/TEST_OTP/);
  });

  it('refuses a misspelt NODE_ENV outright', () => {
    expect(parseEnv({ ...base, NODE_ENV: 'prod' }).ok).toBe(false);
    expect(parseEnv({ ...base, NODE_ENV: 'Production', TEST_OTP: '1234' }).ok).toBe(false);
  });

  it('treats an empty TEST_OTP as unset', () => {
    expect(parseEnv({ ...prod, TEST_OTP: '' }).ok).toBe(true);
  });
});

describe('production config guards', () => {
  it('accepts a sane production config', () => {
    expect(errorsOf(prod)).toEqual([]);
  });
  it('refuses wildcard CORS, placeholder keys and the mock KYC provider', () => {
    expect(errorsOf({ ...prod, CORS_ORIGINS: '*' }).join()).toMatch(/CORS/);
    expect(errorsOf({ ...prod, DATA_ENCRYPTION_KEY: '0'.repeat(64) }).join()).toMatch(/DATA_ENCRYPTION_KEY/);
    expect(errorsOf({ ...prod, KYC_PROVIDER: 'mock' }).join()).toMatch(/KYC_PROVIDER/);
  });
  it('requires a 32+ character JWT secret', () => {
    expect(errorsOf({ ...base, NODE_ENV: 'development', JWT_SECRET: 'short-secret-1234' }).join()).toMatch(/JWT_SECRET/);
  });
  it('defaults TRUST_PROXY to off', () => {
    const r = parseEnv({ ...base, NODE_ENV: 'development' });
    expect(r.ok && r.env.TRUST_PROXY).toBe(false);
  });
});
