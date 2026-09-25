import type { Request } from 'express';
import { z, type ZodTypeAny } from 'zod';
import { badRequest } from './errors';

export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest('Validation failed', result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  return result.data;
}

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export function pagination(req: Request) {
  const { page, pageSize } = parse(paginationSchema, req.query);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/** Indian mobile numbers, normalised to E.164 (+91XXXXXXXXXX). */
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ''))
  .transform((v) => (v.startsWith('+') ? v : v.length === 10 ? `+91${v}` : `+${v}`))
  .refine((v) => /^\+91[6-9]\d{9}$/.test(v), 'Enter a valid 10-digit Indian mobile number');

/**
 * Largest single amount accepted, in rupees. Money columns are 32-bit INTEGER paise (max ≈ ₹2.14 crore),
 * so anything above this would overflow the database. Migrate to BIGINT before raising it.
 */
export const MAX_AMOUNT_RUPEES = 2_00_00_000; // ₹2 crore

/** Accepts rupees (number) from clients and converts to integer paise. */
export const rupeesToPaise = z.coerce
  .number()
  .positive()
  .max(MAX_AMOUNT_RUPEES, 'Amount cannot exceed ₹2,00,00,000')
  .transform((r) => Math.round(r * 100));
