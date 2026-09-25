import type { Prisma } from '@prisma/client';

/** Fields safe to return to clients (never passwordHash). */
export const publicUserSelect = {
  id: true,
  phone: true,
  email: true,
  name: true,
  role: true,
  referredById: true,
  kycStatus: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export const userSummarySelect = { id: true, name: true, phone: true } satisfies Prisma.UserSelect;
