import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@refera.app').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';
  const phone = process.env.SEED_ADMIN_PHONE ?? '+919999999999';

  const admin = await prisma.user.upsert({
    where: { email },
    update: { role: 'admin', passwordHash: await bcrypt.hash(password, 12) },
    create: { email, phone, name: 'Refera Admin', role: 'admin', kycStatus: 'verified', passwordHash: await bcrypt.hash(password, 12) },
  });
  console.log(`Admin: ${admin.email} / ${password}`);

  if ((await prisma.commissionRule.count()) === 0) {
    // flat values in paise, percent values in basis points
    await prisma.commissionRule.createMany({
      data: [
        { productType: 'credit_card', commissionType: 'flat', value: 150000, tier: 1 }, // ₹1,500
        { productType: 'credit_card', commissionType: 'flat', value: 20000, tier: 2 }, //  ₹200
        { productType: 'loan', commissionType: 'percent', value: 100, tier: 1 }, //        1% of disbursal
        { productType: 'loan', commissionType: 'percent', value: 10, tier: 2 }, //         0.1%
        { productType: 'insurance', commissionType: 'percent', value: 1000, tier: 1 }, //  10% of premium
      ],
    });
    console.log('Seeded default commission rules');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
