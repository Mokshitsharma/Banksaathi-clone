import crypto from 'node:crypto';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { encrypt, mask } from '../../lib/crypto';
import { badRequest } from '../../lib/errors';
import { parse } from '../../lib/http';
import { currentUser, requireAuth } from '../../middleware/auth';
import { kyc } from '../../providers/kyc';
import { storage } from '../../providers/storage';
import { assertEditable, getOrCreateKycRecord, kycState, refreshKycStatus } from './kyc.service';

export const kycRouter = Router();
kycRouter.use(requireAuth);

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, ALLOWED_MIME.has(file.mimetype)),
});

kycRouter.get('/', async (req, res) => {
  res.json(await kycState(currentUser(req).id));
});

kycRouter.post('/aadhaar/otp', async (req, res) => {
  const userId = currentUser(req).id;
  await assertEditable(userId);
  const { aadhaarNumber } = parse(
    z.object({ aadhaarNumber: z.string().transform((v) => v.replace(/\s/g, '')).refine((v) => /^[2-9]\d{11}$/.test(v), 'Enter a valid 12-digit Aadhaar number') }),
    req.body,
  );
  // The Aadhaar number goes straight to the provider and is never persisted.
  const { refId } = await kyc.aadhaarSendOtp(aadhaarNumber);
  await getOrCreateKycRecord(userId);
  await prisma.kycRecord.update({ where: { userId }, data: { aadhaarPendingRefId: refId } });
  res.json({ otpSent: true });
});

kycRouter.post('/aadhaar/verify', async (req, res) => {
  const userId = currentUser(req).id;
  await assertEditable(userId);
  const { otp } = parse(z.object({ otp: z.string().regex(/^\d{4,6}$/, 'Enter the OTP you received') }), req.body);
  const record = await getOrCreateKycRecord(userId);
  if (!record.aadhaarPendingRefId) throw badRequest('Request an Aadhaar OTP first');
  const result = await kyc.aadhaarVerifyOtp(record.aadhaarPendingRefId, otp);
  if (!result.verified) throw badRequest('Aadhaar OTP verification failed');
  await prisma.kycRecord.update({
    where: { userId },
    data: {
      aadhaarVerified: true,
      aadhaarRefId: result.verificationId ?? record.aadhaarPendingRefId,
      aadhaarPendingRefId: null,
      nameAsPerKyc: result.name ?? record.nameAsPerKyc,
      verificationProvider: kyc.name,
    },
  });
  await refreshKycStatus(userId);
  res.json(await kycState(userId));
});

kycRouter.post('/pan', async (req, res) => {
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

kycRouter.post('/bank', async (req, res) => {
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
  const ext = path.extname(req.file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '';
  const key = `kyc/${userId}/${type}-${crypto.randomUUID()}${ext}`;
  await storage.put(key, req.file.buffer, req.file.mimetype);
  const doc = await prisma.kycDocument.create({
    data: {
      userId,
      type,
      storageKey: key,
      fileName: req.file.originalname.slice(0, 200),
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
    },
  });
  res.status(201).json({ id: doc.id, type: doc.type, fileName: doc.fileName, createdAt: doc.createdAt, url: await storage.signedUrl(key) });
});
