import { prisma } from '../../db/prisma';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { notifyUser } from '../../providers/push';
import { storage } from '../../providers/storage';

export async function getOrCreateKycRecord(userId: string) {
  return prisma.kycRecord.upsert({ where: { userId }, update: {}, create: { userId }, include: { user: { select: { kycStatus: true } } } });
}

/** Verification steps are locked once submitted; supporting documents may still be added during review. */
export async function assertEditable(userId: string, { allowDuringReview = false } = {}) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { kycStatus: true } });
  if (user.kycStatus === 'verified') throw conflict('KYC is already verified');
  if (user.kycStatus === 'pending' && !allowDuringReview) throw conflict('KYC is under review');
}

/** Once Aadhaar, PAN and bank all pass, the user moves to "pending" for admin review. */
export async function refreshKycStatus(userId: string) {
  const record = await prisma.kycRecord.findUnique({ where: { userId } });
  if (record?.aadhaarVerified && record.panVerified && record.bankVerified) {
    await prisma.user.updateMany({
      where: { id: userId, kycStatus: { in: ['unverified', 'rejected'] } },
      data: { kycStatus: 'pending' },
    });
  }
}

export async function kycState(userId: string) {
  const [user, record, documents] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { kycStatus: true } }),
    prisma.kycRecord.findUnique({ where: { userId } }),
    prisma.kycDocument.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
  ]);
  return {
    kycStatus: user.kycStatus,
    aadhaarVerified: record?.aadhaarVerified ?? false,
    panVerified: record?.panVerified ?? false,
    bankVerified: record?.bankVerified ?? false,
    panMasked: record?.panMasked ?? null,
    bankAccountMasked: record?.bankAccountMasked ?? null,
    bankIfsc: record?.bankIfsc ?? null,
    nameAsPerKyc: record?.nameAsPerKyc ?? null,
    rejectionReason: record?.rejectionReason ?? null,
    verifiedAt: record?.verifiedAt ?? null,
    documents: await Promise.all(
      documents.map(async (d) => ({
        id: d.id,
        type: d.type,
        fileName: d.fileName,
        mimeType: d.mimeType,
        createdAt: d.createdAt,
        url: await storage.signedUrl(d.storageKey),
      })),
    ),
  };
}

export async function approveKyc(userId: string) {
  const record = await prisma.kycRecord.findUnique({ where: { userId }, include: { user: { select: { kycStatus: true } } } });
  if (!record) throw notFound('No KYC submission for this user');
  if (!(record.aadhaarVerified && record.panVerified && record.bankVerified)) {
    throw badRequest('Aadhaar, PAN and bank must all be verified before approval');
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { kycStatus: 'verified' } }),
    prisma.kycRecord.update({ where: { userId }, data: { verifiedAt: new Date(), rejectionReason: null } }),
  ]);
  notifyUser(userId, { title: 'KYC approved', body: 'You can now withdraw your earnings.', data: { type: 'kyc' } });
}

/** Rejection clears verification flags so the affiliate redoes the checks. */
export async function rejectKyc(userId: string, reason: string) {
  const record = await prisma.kycRecord.findUnique({ where: { userId } });
  if (!record) throw notFound('No KYC submission for this user');
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { kycStatus: 'rejected' } }),
    prisma.kycRecord.update({
      where: { userId },
      data: { rejectionReason: reason, verifiedAt: null, aadhaarVerified: false, panVerified: false, bankVerified: false },
    }),
  ]);
  notifyUser(userId, { title: 'KYC needs attention', body: reason, data: { type: 'kyc' } });
}
