import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { sms } from '../src/providers/sms';
import { MOCK_AADHAAR_OTP } from '../src/providers/kyc';

const app = createApp();
let lastOtp = '';
vi.spyOn(sms, 'sendOtp').mockImplementation(async (_phone, otp) => {
  lastOtp = otp;
});

async function login(phone: string, extra: Record<string, string> = {}) {
  await request(app).post('/auth/otp/send').send({ phone }).expect(200);
  const res = await request(app).post('/auth/otp/verify').send({ phone, otp: lastOtp, ...extra }).expect(200);
  return res.body as { token: string; user: { id: string }; isNewUser: boolean };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

let adminToken = '';

beforeAll(async () => {
  await prisma.user.create({
    data: {
      email: 'admin@test.dev',
      phone: '+919000000000',
      role: 'admin',
      passwordHash: await bcrypt.hash('secret123', 4),
    },
  });
  const res = await request(app).post('/auth/admin/login').send({ email: 'admin@test.dev', password: 'secret123' }).expect(200);
  adminToken = res.body.token;
  await request(app)
    .post('/admin/commission-rules')
    .set(auth(adminToken))
    .send({ productType: 'loan', commissionType: 'percent', value: 1, tier: 1 })
    .expect(201);
  await request(app)
    .post('/admin/commission-rules')
    .set(auth(adminToken))
    .send({ productType: 'loan', commissionType: 'flat', value: 250, tier: 2 })
    .expect(201);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('OTP auth', () => {
  it('rejects a wrong OTP and accepts the right one', async () => {
    await request(app).post('/auth/otp/send').send({ phone: '9876500001' }).expect(200);
    const wrong = lastOtp === '000000' ? '111111' : '000000';
    await request(app).post('/auth/otp/verify').send({ phone: '9876500001', otp: wrong }).expect(401);
    const ok = await request(app).post('/auth/otp/verify').send({ phone: '9876500001', otp: lastOtp }).expect(200);
    expect(ok.body.isNewUser).toBe(true);
    expect(ok.body.user.phone).toBe('+919876500001');
    // OTP is single-use
    await request(app).post('/auth/otp/verify').send({ phone: '9876500001', otp: lastOtp }).expect(401);
  });

  it('enforces the resend cooldown', async () => {
    await request(app).post('/auth/otp/send').send({ phone: '9876500002' }).expect(200);
    await request(app).post('/auth/otp/send').send({ phone: '9876500002' }).expect(429);
  });

  it('blocks protected routes without a token and non-admins from admin routes', async () => {
    await request(app).get('/me').expect(401);
    const u = await login('9876500003');
    await request(app).get('/admin/analytics').set(auth(u.token)).expect(403);
  });
});

describe('offers', () => {
  it('shows active rules with their offer copy to affiliates', async () => {
    const u = await login('9876544444');
    const created = await request(app)
      .post('/admin/commission-rules')
      .set(auth(adminToken))
      .send({ productType: 'insurance', commissionType: 'flat', value: 999, tier: 1, title: '  Insurance bonus  ', description: 'Earn on every policy' })
      .expect(201);
    expect(created.body.title).toBe('Insurance bonus');

    const offers = await request(app).get('/offers').set(auth(u.token)).expect(200);
    const offer = offers.body.find((o: { id: string }) => o.id === created.body.id);
    expect(offer).toMatchObject({ title: 'Insurance bonus', description: 'Earn on every policy', value: 99900, commissionType: 'flat' });

    // Empty string clears copy; paused rules disappear from offers.
    await request(app).patch(`/admin/commission-rules/${created.body.id}`).set(auth(adminToken)).send({ description: '' }).expect(200);
    const cleared = await request(app).get('/offers').set(auth(u.token)).expect(200);
    expect(cleared.body.find((o: { id: string }) => o.id === created.body.id).description).toBeNull();

    await request(app).patch(`/admin/commission-rules/${created.body.id}`).set(auth(adminToken)).send({ active: false }).expect(200);
    const after = await request(app).get('/offers').set(auth(u.token)).expect(200);
    expect(after.body.some((o: { id: string }) => o.id === created.body.id)).toBe(false);

    await request(app).get('/offers').expect(401);
  });

  it('rejects a percent rule edited above 100%', async () => {
    const rules = await request(app).get('/admin/commission-rules').set(auth(adminToken)).expect(200);
    const percent = rules.body.find((r: { commissionType: string }) => r.commissionType === 'percent');
    await request(app).patch(`/admin/commission-rules/${percent.id}`).set(auth(adminToken)).send({ value: 150 }).expect(400);
  });
});

describe('referral → lead → commission → ledger → payout', () => {
  it('runs the whole money flow end to end', async () => {
    // Upline (tier 2) invites the referrer (tier 1)
    const upline = await login('9876511111', { name: 'Upline' });
    const uplineLink = await request(app).get('/referrals/link').set(auth(upline.token)).expect(200);
    const referrer = await login('9876522222', { referralCode: uplineLink.body.code, name: 'Referrer' });
    expect(referrer.isNewUser).toBe(true);

    const downline = await request(app).get('/referrals/downline').set(auth(upline.token)).expect(200);
    expect(downline.body.members).toHaveLength(1);
    expect(downline.body.members[0].level).toBe(1);

    // Lead captured from the referrer's public link
    const refLink = await request(app).get('/referrals/link').set(auth(referrer.token)).expect(200);
    const created = await request(app)
      .post('/leads/public')
      .send({ referralCode: refLink.body.code, productType: 'loan', leadName: 'Ravi Kumar', leadPhone: '9123456789' })
      .expect(201);
    await request(app)
      .post('/leads/public')
      .send({ referralCode: refLink.body.code, productType: 'loan', leadName: 'Ravi Kumar', leadPhone: '9123456789' })
      .expect(400); // duplicate open lead

    const leadId = created.body.id;
    const status = (s: string, extra = {}) =>
      request(app).patch(`/admin/leads/${leadId}/status`).set(auth(adminToken)).send({ status: s, ...extra });

    await status('converted').expect(400); // can't skip the pipeline
    await status('contacted').expect(200);
    await status('in_progress').expect(200);
    await status('converted').expect(400); // percent rule needs a deal amount
    const converted = await status('converted', { dealAmount: 500000 }).expect(200);
    expect(converted.body.commissions).toHaveLength(2);

    const summary1 = await request(app).get('/earnings/summary').set(auth(referrer.token)).expect(200);
    expect(summary1.body.pendingPaise).toBe(500000); // 1% of ₹5,00,000 = ₹5,000
    expect(summary1.body.availableBalancePaise).toBe(0);

    const uplineCommissions = await request(app).get('/earnings/commissions').set(auth(upline.token)).expect(200);
    expect(uplineCommissions.body.items[0].amountPaise).toBe(25000); // ₹250 flat tier 2

    // Approve → credits ledger
    const mine = await request(app).get('/earnings/commissions').set(auth(referrer.token)).expect(200);
    await request(app).post(`/admin/commissions/${mine.body.items[0].id}/approve`).set(auth(adminToken)).expect(200);
    await request(app).post(`/admin/commissions/${mine.body.items[0].id}/approve`).set(auth(adminToken)).expect(400);

    const summary2 = await request(app).get('/earnings/summary').set(auth(referrer.token)).expect(200);
    expect(summary2.body.availableBalancePaise).toBe(500000);

    // Payout is blocked until KYC is verified
    await request(app).post('/earnings/payouts').set(auth(referrer.token)).send({ amount: 1000 }).expect(403);

    // KYC: Aadhaar OTP, PAN, bank → pending review → admin approves
    await request(app).post('/kyc/aadhaar/otp').set(auth(referrer.token)).send({ aadhaarNumber: '2345 6789 0123' }).expect(200);
    await request(app).post('/kyc/aadhaar/verify').set(auth(referrer.token)).send({ otp: '000000' }).expect(400);
    await request(app).post('/kyc/aadhaar/verify').set(auth(referrer.token)).send({ otp: MOCK_AADHAAR_OTP }).expect(200);
    await request(app).post('/kyc/pan').set(auth(referrer.token)).send({ pan: 'abcpe1234f' }).expect(200);
    const bank = await request(app)
      .post('/kyc/bank')
      .set(auth(referrer.token))
      .send({ accountNumber: '123456789012', ifsc: 'HDFC0001234' })
      .expect(200);
    expect(bank.body.kycStatus).toBe('pending');
    expect(bank.body.panMasked).toBe('XXXXXX234F');
    expect(bank.body.bankAccountMasked).toBe('XXXXXXXX9012');

    const doc = await request(app)
      .post('/kyc/documents')
      .set(auth(referrer.token))
      .field('type', 'pan_card')
      .attach('file', Buffer.from('%PDF-1.4 test'), { filename: 'pan.pdf', contentType: 'application/pdf' })
      .expect(201);
    const fileUrl = new URL(doc.body.url);
    await request(app).get(fileUrl.pathname + fileUrl.search).expect(200);
    await request(app).get(fileUrl.pathname + '?expires=9999999999&sig=forged').expect(403);

    // No raw Aadhaar or PAN is stored
    const record = await prisma.kycRecord.findUniqueOrThrow({ where: { userId: referrer.user.id } });
    expect(JSON.stringify(record)).not.toContain('234567890123');
    expect(record.panNumberEncrypted).not.toContain('ABCPE1234F');

    await request(app).post(`/admin/kyc/${referrer.user.id}/approve`).set(auth(adminToken)).expect(200);

    // Payout: over-balance rejected, valid request debits ledger
    await request(app).post('/earnings/payouts').set(auth(referrer.token)).send({ amount: 999999 }).expect(400);
    const p1 = await request(app).post('/earnings/payouts').set(auth(referrer.token)).send({ amount: 2000 }).expect(201);
    const p2 = await request(app).post('/earnings/payouts').set(auth(referrer.token)).send({ amount: 3000 }).expect(201);

    // Fail p1 → reversal; complete p2
    await request(app).post(`/admin/payouts/${p1.body.id}/fail`).set(auth(adminToken)).send({ reason: 'Bank rejected' }).expect(200);
    await request(app).post(`/admin/payouts/${p2.body.id}/process`).set(auth(adminToken)).expect(200);
    await request(app).post(`/admin/payouts/${p2.body.id}/complete`).set(auth(adminToken)).send({ transactionRef: 'UTR123456' }).expect(200);
    await request(app).post(`/admin/payouts/${p2.body.id}/fail`).set(auth(adminToken)).send({ reason: 'late' }).expect(400);

    const summary3 = await request(app).get('/earnings/summary').set(auth(referrer.token)).expect(200);
    expect(summary3.body.paidPaise).toBe(300000);
    expect(summary3.body.availableBalancePaise).toBe(200000);

    const ledger = await request(app).get('/earnings/ledger').set(auth(referrer.token)).expect(200);
    expect(ledger.body.items.map((e: { type: string }) => e.type).sort()).toEqual(
      ['commission_credit', 'payout_debit', 'payout_debit', 'payout_reversal'].sort(),
    );
    expect(ledger.body.items[0].balanceAfterPaise).toBe(200000);

    // Ledger is append-only at the database level
    await expect(prisma.ledgerEntry.updateMany({ where: { userId: referrer.user.id }, data: { amountPaise: 1 } })).rejects.toThrow();
    await expect(prisma.ledgerEntry.deleteMany({ where: { userId: referrer.user.id } })).rejects.toThrow();

    const analytics = await request(app).get('/admin/analytics').set(auth(adminToken)).expect(200);
    // Analytics are global and other test files share the database, so only assert this lead is counted.
    expect(analytics.body.leadsByStatus.converted).toBeGreaterThanOrEqual(1);
  });

  it('serialises concurrent payout requests so the balance never goes negative', async () => {
    const u = await login('9876533333');
    const lead = await prisma.lead.create({
      data: { referredByUserId: u.user.id, productType: 'loan', leadName: 'X', leadPhone: '+919111111111', status: 'converted' },
    });
    const c = await prisma.commission.create({ data: { leadId: lead.id, userId: u.user.id, tier: 1, amountPaise: 50000 } });
    await request(app).post(`/admin/commissions/${c.id}/approve`).set(auth(adminToken)).expect(200);
    await prisma.user.update({ where: { id: u.user.id }, data: { kycStatus: 'verified' } });

    const results = await Promise.all(
      Array.from({ length: 5 }, () => request(app).post('/earnings/payouts').set(auth(u.token)).send({ amount: 200 })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(2); // ₹500 balance / ₹200 each
    const summary = await request(app).get('/earnings/summary').set(auth(u.token)).expect(200);
    expect(summary.body.availableBalancePaise).toBe(10000);
  });
});
