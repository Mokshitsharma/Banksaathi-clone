import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { parse } from '../../lib/http';
import { currentUser, requireAuth } from '../../middleware/auth';
import { publicUserSelect } from './user.select';

export const userRouter = Router();
userRouter.use(requireAuth);

userRouter.get('/', async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: currentUser(req).id }, select: publicUserSelect });
  res.json(user);
});

userRouter.patch('/', async (req, res) => {
  const data = parse(
    z.object({
      name: z.string().trim().min(1).max(100).optional(),
      email: z.string().trim().toLowerCase().email().optional(),
    }),
    req.body,
  );
  const user = await prisma.user.update({ where: { id: currentUser(req).id }, data, select: publicUserSelect });
  res.json(user);
});

/** Registers an FCM device token for push notifications. */
userRouter.post('/devices', async (req, res) => {
  const { token, platform } = parse(
    z.object({ token: z.string().min(10).max(4096), platform: z.enum(['android', 'ios', 'web']) }),
    req.body,
  );
  const userId = currentUser(req).id;
  await prisma.deviceToken.upsert({
    where: { token },
    update: { userId, platform },
    create: { token, platform, userId },
  });
  res.status(204).end();
});

userRouter.delete('/devices', async (req, res) => {
  const { token } = parse(z.object({ token: z.string().min(1) }), req.body);
  await prisma.deviceToken.deleteMany({ where: { token, userId: currentUser(req).id } });
  res.status(204).end();
});
