import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgresql://refera:refera@localhost:5432/refera_test?schema=public';

/** Applies migrations to the dedicated test database, then empties every table. */
export default async function setup() {
  if (!/refera_test/.test(TEST_DB)) throw new Error(`Refusing to wipe a non-test database: ${TEST_DB}`);
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_DB, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
  });
  const prisma = new PrismaClient({ datasourceUrl: TEST_DB });
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  // TRUNCATE doesn't fire the row-level ledger immutability trigger.
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
  await prisma.$disconnect();
}
