import 'dotenv/config';
import { z } from 'zod';

const PLACEHOLDER_JWT_SECRET = 'change-me-to-a-long-random-string';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  REFERRAL_BASE_URL: z.string().url().default('https://refera.app/r'),
  /** Comma-separated browser origins allowed by CORS. `*` is rejected in production. */
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  /**
   * Express "trust proxy" setting. Leave false unless the API sits behind a reverse proxy/load balancer;
   * otherwise clients can spoof X-Forwarded-For and dodge IP rate limits. Use a hop count (e.g. 1) behind a proxy.
   */
  TRUST_PROXY: z
    .string()
    .default('false')
    .transform((v) => (v === 'false' || v === '0' ? false : v === 'true' ? true : /^\d+$/.test(v) ? Number(v) : v)),

  DATABASE_URL: z.string().min(1),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  /** Affiliate (mobile) session lifetime. */
  JWT_EXPIRES_IN: z.string().default('7d'),
  /** Admin panel session lifetime — shorter because admin tokens can move money. */
  ADMIN_JWT_EXPIRES_IN: z.string().default('12h'),
  DATA_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'DATA_ENCRYPTION_KEY must be 64 hex chars'),

  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  /** Wrong OTP guesses allowed per phone within OTP_LOCKOUT_MINUTES before verification is locked. */
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  OTP_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),
  SMS_PROVIDER: z.enum(['console']).default('console'),
  /** Fixed OTP for development/testing (e.g. 1234). Only honoured when NODE_ENV is explicitly development or test. */
  TEST_OTP: z.string().regex(/^\d{4,6}$/, 'TEST_OTP must be 4-6 digits').optional().or(z.literal('').transform(() => undefined)),

  KYC_PROVIDER: z.enum(['mock', 'digio', 'karza', 'signzy', 'hyperverge']).default('mock'),
  KYC_API_KEY: z.string().optional(),
  KYC_API_SECRET: z.string().optional(),
  KYC_BASE_URL: z.string().optional(),

  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  LOCAL_UPLOAD_DIR: z.string().default('./uploads'),
  AWS_REGION: z.string().default('ap-south-1'),
  AWS_S3_BUCKET: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().max(3600).default(600),

  PUSH_PROVIDER: z.enum(['console', 'fcm']).default('console'),
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().optional(),

  MIN_PAYOUT_PAISE: z.coerce.number().int().nonnegative().default(10000),
});

export type Env = z.infer<typeof schema>;

/**
 * Validates raw environment variables. Pure (no process.exit) so the safety rules can be unit-tested.
 * Returns human-readable problems instead of throwing.
 */
export function parseEnv(raw: Record<string, string | undefined>): { ok: true; env: Env } | { ok: false; errors: string[] } {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
  const env = parsed.data;
  const errors: string[] = [];

  // A fixed OTP must never reach a real deployment. Require an explicit, non-production NODE_ENV so that a
  // missing or misspelt NODE_ENV (which would otherwise default to "development") cannot enable it.
  const explicitEnv = raw.NODE_ENV?.trim();
  if (env.TEST_OTP && explicitEnv !== 'development' && explicitEnv !== 'test') {
    errors.push('TEST_OTP is set but NODE_ENV is not explicitly "development" or "test". Unset TEST_OTP for real deployments.');
  }

  if (env.NODE_ENV === 'production') {
    if (env.CORS_ORIGINS.split(',').some((o) => o.trim() === '*')) errors.push('CORS_ORIGINS must list exact origins in production (no "*")');
    if (/^0+$/.test(env.DATA_ENCRYPTION_KEY)) errors.push('DATA_ENCRYPTION_KEY is the all-zero placeholder');
    if (env.JWT_SECRET === PLACEHOLDER_JWT_SECRET) errors.push('JWT_SECRET is the placeholder value');
    if (env.KYC_PROVIDER === 'mock') errors.push('KYC_PROVIDER=mock is not allowed in production');
  }

  return errors.length ? { ok: false, errors } : { ok: true, env };
}

const result = parseEnv(process.env);
if (!result.ok) {
  console.error('Invalid environment configuration:');
  for (const e of result.errors) console.error(`  ${e}`);
  process.exit(1);
}

export const env = result.env;
export const isProd = env.NODE_ENV === 'production';
