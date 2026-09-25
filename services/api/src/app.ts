import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error';
import { adminRouter } from './modules/admin/admin.routes';
import { authRouter } from './modules/auth/auth.routes';
import { earningsRouter } from './modules/commissions/earnings.routes';
import { fileRouter } from './modules/files/file.routes';
import { kycRouter } from './modules/kyc/kyc.routes';
import { leadRouter } from './modules/leads/lead.routes';
import { offerRouter } from './modules/offers/offer.routes';
import { referralRouter } from './modules/referrals/referral.routes';
import { userRouter } from './modules/users/user.routes';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  const origins = env.CORS_ORIGINS.split(',').map((o) => o.trim());
  app.use(cors({ origin: origins.includes('*') ? true : origins }));
  app.use(express.json({ limit: '100kb' }));
  if (env.NODE_ENV !== 'test') app.use(morgan('dev'));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/auth', authRouter);
  app.use('/me', userRouter);
  app.use('/referrals', referralRouter);
  app.use('/leads', leadRouter);
  app.use('/earnings', earningsRouter);
  app.use('/offers', offerRouter);
  app.use('/kyc', kycRouter);
  app.use('/admin', adminRouter);
  app.use('/files', fileRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
