import { defineConfig } from 'vitest/config';

const TEST_DB =
  process.env.TEST_DATABASE_URL ?? 'postgresql://refera:refera@localhost:5432/refera_test?schema=public';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DB,
      JWT_SECRET: 'test-secret-test-secret-test-secret',
      DATA_ENCRYPTION_KEY: '11'.repeat(32),
      LOCAL_UPLOAD_DIR: './.test-uploads',
      MIN_PAYOUT_PAISE: '10000',
    },
  },
});
