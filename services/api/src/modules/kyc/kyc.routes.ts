import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { z } from 'zod';
import { env } from '../../config/env';
import { prisma } from '../../db/prisma';
import { encrypt, mask } from '../../lib/crypto';
import { badRequest, tooMany } from '../../lib/errors';
import { parse } from '../../lib/http';
import { currentUser, requireAuth } from '../../middleware/auth';
import { kyc } from '../../providers/kyc';
import { storage } from '../../providers/storage';
import { assertEditable, getOrCreateKycRecord, kycState, refreshKycStatus } from './kyc.service';

export const kycRouter = Router();
kycRouter.use(requireAuth);

/** Wrong guesses allowed against one Aadhaar OTP before a new OTP must be requested. */
export const AADHAAR_MAX_ATTEMPTS = 5;
const MAX_DOCUMENTS_PER_USER = 20;

/**
 * Per-user cap on calls that hit the (paid) KYC provider: Aadhaar OTP send/verify, PAN, bank penny-drop.
 * Keyed by user id, not IP. Uses the in-memory store — per process only (see docs/brain/05-SECURITY.md).
 */
const providerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: env.NODE_ENV === 'test' ? 10_000 : 15,
  keyGenerator: (req) => currentUser(req).id,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many verification attempts. Try again in an hour.' } },
});

/** The file extension is derived from the verified content type — never from the client's filename. */
const ALLOWED_TYPES: Record<string, { ext: string; magic: number[] }> = {
  'image/jpeg': { ext: '.jpg', magic: [0xff, 0xd8, 0xff] },
  'image/png': { ext: '.png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  'application/pdf': { ext: '.pdf', magic: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
};

export function matchesMagicBytes(buffer: Buffer, mimeType: string) {
  const spec = ALLOWED_TYPES[mimeType];
  return !!spec && buffer.length >= spec.magic.length && spec.magic.every((b, i) => buffer[i] === b);
}

/** Display-only name: strip any path components and control characters. */
export function safeDisplayName(original: string) {
  const base = original.split(/[\\/]/).pop() ?? 'document';
  return base.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200) || 'document';
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 5, fieldSize: 1024, parts: 7 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype in ALLOWED_TYPES),
});

kycRouter.get('/', async (req, res) => {
  res.json(await kycState(currentUser(req).id));
});

kycRouter.post('/aadhaar/otp', providerLimiter, async (req, res) => {
  const userId = currentUser(req).id;
  await assertEditable(userId);
  const { aadhaarNumber } = parse(
    z.object({ aadhaarNumber: z.string().max(20).transform((v) => v.replace(/\s/g, '')).refine((v) => /^[2-9]\d{11}$/.test(v), 'Enter a valid 12-digit Aadhaar number') }),
    req.body,
  );
  // The Aadhaar number goes straight to the provider and is never persisted.
  const { refId } = await kyc.aadhaarSendOtp(aadhaarNumber);
  await getOrCreateKycRecord(userId);
  await prisma.kycRecord.update({ where: { userId }, data: { aadhaarPendingRefId: refId, aadhaarOtpAttempts: 0 } });
  res.json({ otpSent: true });
});

kycRouter.post('/aadhaar/verify', providerLimiter, async (req, res) => {
  const userId = currentUser(req).id;
  await assertEditable(userId);
  const { otp } = parse(z.object({ otp: z.string().regex(/^\d{4,6}$/, 'Enter the OTP you received') }), req.body);
  const record = await getOrCreateKycRecord(userId);
  if (!record.aadhaarPendingRefId) throw badRequest('Request an Aadhaar OTP first');

  // Reserve an attempt atomically so parallel guesses can't exceed the cap.
  const reserved = await prisma.kycRecord.updateMany({
    where: { userId, aadhaarPendingRefId: record.aadhaarPendingRefId, aadhaarOtpAttempts: { lt: AADHAAR_MAX_ATTEMPTS } },
    data: { aadhaarOtpAttempts: { increment: 1 } },
  });
  if (reserved.count === 0) throw tooMany('Too many incorrect attempts. Request a new Aadhaar OTP.');

  const result = await kyc.aadhaarVerifyOtp(record.aadhaarPendingRefId, otp);
  if (!result.verified) throw badRequest('Aadhaar OTP verification failed');
  await prisma.kycRecord.update({
    where: { userId },
    data: {
      aadhaarVerified: true,
      aadhaarRefId: result.verificationId ?? record.aadhaarPendingRefId,
      aadhaarPendingRefId: null,
      aadhaarOtpAttempts: 0,
      nameAsPerKyc: result.name ?? record.nameAsPerKyc,
      verificationProvider: kyc.name,
    },
  });
  await refreshKycStatus(userId);
  res.json(await kycState(userId));
});

kycRouter.post('/pan', providerLimiter, async (req, res) => {
  const userId = currentUser(req).id;
  await assertEditable(userId);
  const { pan, name } = parse(
    z.object({
      pan: z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/, 'Enter a valid PAN (e.g. ABCDE1234F)'),
      name: z.string().trim().max(100).optional(),
    }),
    req.body,
  );
  const result = await kyc.verifyPan(pan, name);
  if (!result.verified) throw badRequest('PAN verification failed');
  await getOrCreateKycRecord(userId);
  await prisma.kycRecord.update({
    where: { userId },
    data: { panVerified: true, panNumberEncrypted: encrypt(pan), panMasked: mask(pan), verificationProvider: kyc.name },
  });
  await refreshKycStatus(userId);
  res.json(await kycState(userId));
});

kycRouter.post('/bank', providerLimiter, async (req, res) => {
  const userId = currentUser(req).id;
  await assertEditable(userId);
  const { accountNumber, ifsc } = parse(
    z.object({
      accountNumber: z.string().trim().regex(/^\d{9,18}$/, 'Account number must be 9–18 digits'),
      ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid IFSC (e.g. HDFC0001234)'),
    }),
    req.body,
  );
  const result = await kyc.verifyBank(accountNumber, ifsc);
  if (!result.verified) throw badRequest('Bank account verification failed');
  await getOrCreateKycRecord(userId);
  await prisma.kycRecord.update({
    where: { userId },
    data: {
      bankVerified: true,
      bankAccountEncrypted: encrypt(accountNumber),
      bankAccountMasked: mask(accountNumber),
      bankIfsc: ifsc,
      verificationProvider: kyc.name,
    },
  });
  await refreshKycStatus(userId);
  res.json(await kycState(userId));
});

kycRouter.post('/documents', upload.single('file'), async (req, res) => {
  const userId = currentUser(req).id;
  await assertEditable(userId, { allowDuringReview: true });
  const { type } = parse(z.object({ type: z.enum(['pan_card', 'bank_proof', 'other']) }), req.body);
  if (!req.file) throw badRequest('Attach a JPG, PNG or PDF file (max 5 MB) in the "file" field');
  // The declared content type is client-controlled; check the file really starts like that type.
  if (!matchesMagicBytes(req.file.buffer, req.file.mimetype)) throw badRequest('File content does not match a JPG, PNG or PDF');
  if ((await prisma.kycDocument.count({ where: { userId } })) >= MAX_DOCUMENTS_PER_USER) {
    throw badRequest(`You can upload at most ${MAX_DOCUMENTS_PER_USER} documents`);
  }

  // Storage key is built only from server-generated parts: no user-controlled path or extension.
  const key = `kyc/${userId}/${type}-${crypto.randomUUID()}${ALLOWED_TYPES[req.file.mimetype].ext}`;
  await storage.put(key, req.file.buffer, req.file.mimetype);
  const doc = await prisma.kycDocument.create({
    data: {
      userId,
      type,
      storageKey: key,
      fileName: safeDisplayName(req.file.originalname),
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
    },
  });
  res.status(201).json({ id: doc.id, type: doc.type, fileName: doc.fileName, createdAt: doc.createdAt, url: await storage.signedUrl(key) });
});
