import { Router } from 'express';
import { prisma } from '../../db/prisma';
import { requireAuth } from '../../middleware/auth';

/** Active commission rules, presented to affiliates as offers. */
export const offerRouter = Router();
offerRouter.use(requireAuth);

offerRouter.get('/', async (_req, res) => {
  const rules = await prisma.commissionRule.findMany({
    where: { active: true },
    orderBy: [{ tier: 'asc' }, { productType: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, productType: true, commissionType: true, value: true, tier: true, title: true, description: true },
  });
  res.json(rules);
});
