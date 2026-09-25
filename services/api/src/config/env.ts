import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  REFERRAL_BASE_URL: z.string().url().default('https://refera.app/r'),
  CORS_ORIGINS: z.string().default('*'),

  DATABASE_URL: z.string().min(1),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  DATA_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'DATA_ENCRYPTION_KEY must be 64 hex chars'),

  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  SMS_PROVIDER: z.enum(['console']).default('console'),
  /** Fixed OTP for development/testing (e.g. 1234). Never allowed in production. */
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
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(600),

  PUSH_PROVIDER: z.enum(['console', 'fcm']).default('console'),
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().optional(),

  MIN_PAYOUT_PAISE: z.coerce.number().int().nonnegative().default(10000),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

if (parsed.data.NODE_ENV === 'production' && parsed.data.TEST_OTP) {
  console.error('TEST_OTP must not be set in production');
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
