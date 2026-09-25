import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DEV_DEFAULT_PASSWORD = 'Admin@12345';

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@refera.app').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? DEV_DEFAULT_PASSWORD;
  const phone = process.env.SEED_ADMIN_PHONE ?? '+919999999999';

  // The dev default password is public (README, .env.example). Never let it reach a real deployment.
  if (process.env.NODE_ENV === 'production' && (password === DEV_DEFAULT_PASSWORD || password.length < 12)) {
    throw new Error('Set SEED_ADMIN_PASSWORD to a unique password of 12+ characters before seeding in production');
  }

  const admin = await prisma.user.upsert({
    where: { email },
    update: { role: 'admin', passwordHash: await bcrypt.hash(password, 12) },
    create: { email, phone, name: 'Refera Admin', role: 'admin', kycStatus: 'verified', passwordHash: await bcrypt.hash(password, 12) },
  });
  console.log(`Admin: ${admin.email} / ${password}`);

  // flat values in paise, percent values in basis points
  const defaults = [
    {
      productType: 'credit_card', commissionType: 'flat', value: 150000, tier: 1, // ₹1,500
      title: 'Refer a credit card, earn ₹1,500',
      description: 'Earn a flat ₹1,500 for every friend who gets a credit card approved and issued through your referral.',
    },
    {
      productType: 'credit_card', commissionType: 'flat', value: 20000, tier: 2, // ₹200
      title: 'Team bonus on credit cards',
      description: 'Earn ₹200 whenever someone you invited converts a credit card lead.',
    },
    {
      productType: 'loan', commissionType: 'percent', value: 100, tier: 1, // 1% of disbursal
      title: 'Personal & business loans: 1% payout',
      description: 'Earn 1% of the disbursed loan amount. A ₹5 lakh loan pays you ₹5,000.',
    },
    {
      productType: 'loan', commissionType: 'percent', value: 10, tier: 2, // 0.1%
      title: 'Team bonus on loans',
      description: 'Earn 0.1% of the loan amount whenever someone in your team gets a loan disbursed.',
    },
    {
      productType: 'insurance', commissionType: 'percent', value: 1000, tier: 1, // 10% of premium
      title: 'Insurance: 10% of first-year premium',
      description: 'Health, life or motor. Earn 10% of the first-year premium when the policy is issued.',
    },
  ] as const;

  if ((await prisma.commissionRule.count()) === 0) {
    await prisma.commissionRule.createMany({ data: defaults.map((d) => ({ ...d })) });
    console.log('Seeded default commission rules');
  } else {
    // Give untitled rules that match a default the default offer copy. Rules an admin already titled are left alone.
    let filled = 0;
    for (const d of defaults) {
      const { count } = await prisma.commissionRule.updateMany({
        where: { productType: d.productType, commissionType: d.commissionType, value: d.value, tier: d.tier, title: null },
        data: { title: d.title, description: d.description },
      });
      filled += count;
    }
    if (filled) console.log(`Added offer copy to ${filled} existing rule(s)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
