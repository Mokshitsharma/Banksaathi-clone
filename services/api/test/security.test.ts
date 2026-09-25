import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { sms } from '../src/providers/sms';
import { MOCK_AADHAAR_OTP } from '../src/providers/kyc';

const app = createApp();
const otps = new Map<string, string>();
vi.spyOn(sms, 'sendOtp').mockImplementation(async (phone, otp) => {
  otps.set(phone, otp);
});

const e164 = (p: string) => `+91${p}`;
const wrongOtp = (p: string) => (otps.get(e164(p)) === '000000' ? '111111' : '000000');
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function login(phone: string, extra: Record<string, string> = {}) {
  await request(app).post('/auth/otp/send').send({ phone }).expect(200);
  const res = await request(app).post('/auth/otp/verify').send({ phone, otp: otps.get(e164(phone)), ...extra }).expect(200);
  return res.body as { token: string; user: { id: string } };
}

const ADMIN_PHONE = '9000000077';
let adminToken = '';

beforeAll(async () => {
  await prisma.user.create({
    data: { email: 'sec-admin@test.dev', phone: e164(ADMIN_PHONE), role: 'admin', passwordHash: await bcrypt.hash('secret123', 4) },
  });
  adminToken = (await request(app).post('/auth/admin/login').send({ email: 'sec-admin@test.dev', password: 'secret123' }).expect(200)).body.token;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('1. OTP brute-force protection', () => {
  it('locks the phone after 5 wrong guesses, even for the correct OTP and even after re-sending', async () => {
    const phone = '9811100001';
    await request(app).post('/auth/otp/send').send({ phone }).expect(200);
    for (let i = 0; i < 5; i++) {
      await request(app).post('/auth/otp/verify').send({ phone, otp: wrongOtp(phone) }).expect(401);
    }
    await request(app).post('/auth/otp/verify').send({ phone, otp: otps.get(e164(phone)) }).expect(429);
    await request(app).post('/auth/otp/send').send({ phone }).expect(429);
  });

  it('caps parallel guesses at the attempt limit (no race)', async () => {
    const phone = '9811100002';
    await request(app).post('/auth/otp/send').send({ phone }).expect(200);
    const results = await Promise.all(
      Array.from({ length: 15 }, () => request(app).post('/auth/otp/verify').send({ phone, otp: wrongOtp(phone) })),
    );
    expect(results.filter((r) => r.status === 401).length).toBeLessThanOrEqual(5);
    const record = await prisma.otpCode.findFirstOrThrow({ where: { phone: e164(phone) }, orderBy: { createdAt: 'desc' } });
    expect(record.attempts).toBeLessThanOrEqual(5);
    await request(app).post('/auth/otp/verify').send({ phone, otp: otps.get(e164(phone)) }).expect(429);
  });

  it('a successful login does not count toward the lockout', async () => {
    const phone = '9811100003';
    await request(app).post('/auth/otp/send').send({ phone }).expect(200);
    await request(app).post('/auth/otp/verify').send({ phone, otp: otps.get(e164(phone)) }).expect(200);
    const record = await prisma.otpCode.findFirstOrThrow({ where: { phone: e164(phone) } });
    expect(record.attempts).toBe(0);
  });

  it('locks the Aadhaar OTP after 5 wrong guesses until a new OTP is requested', async () => {
    const u = await login('9811100004');
    await request(app).post('/kyc/aadhaar/otp').set(auth(u.token)).send({ aadhaarNumber: '234567890123' }).expect(200);
    for (let i = 0; i < 5; i++) {
      await request(app).post('/kyc/aadhaar/verify').set(auth(u.token)).send({ otp: '999999' }).expect(400);
    }
    await request(app).post('/kyc/aadhaar/verify').set(auth(u.token)).send({ otp: MOCK_AADHAAR_OTP }).expect(429);
    await request(app).post('/kyc/aadhaar/otp').set(auth(u.token)).send({ aadhaarNumber: '234567890123' }).expect(200);
    await request(app).post('/kyc/aadhaar/verify').set(auth(u.token)).send({ otp: MOCK_AADHAAR_OTP }).expect(200);
  });
});

describe('3. Server-side admin role enforcement', () => {
  const FAKE_ID = '00000000-0000-4000-8000-000000000000';
  const ADMIN_ROUTES: [string, string][] = [
    ['get', '/admin/analytics'],
    ['get', '/admin/users'],
    ['get', `/admin/users/${FAKE_ID}`],
    ['patch', `/admin/leads/${FAKE_ID}/status`],
    ['get', '/admin/kyc'],
    ['get', `/admin/kyc/${FAKE_ID}`],
    ['post', `/admin/kyc/${FAKE_ID}/approve`],
    ['post', `/admin/kyc/${FAKE_ID}/reject`],
    ['get', '/admin/commission-rules'],
    ['post', '/admin/commission-rules'],
    ['patch', `/admin/commission-rules/${FAKE_ID}`],
    ['delete', `/admin/commission-rules/${FAKE_ID}`],
    ['get', '/admin/commissions'],
    ['post', `/admin/commissions/${FAKE_ID}/approve`],
    ['post', `/admin/commissions/${FAKE_ID}/reject`],
    ['get', '/admin/payouts'],
    ['post', `/admin/payouts/${FAKE_ID}/process`],
    ['post', `/admin/payouts/${FAKE_ID}/complete`],
    ['post', `/admin/payouts/${FAKE_ID}/fail`],
  ];

  it('rejects every admin route for anonymous (401) and affiliate (403) callers', async () => {
    const affiliate = await login('9811100010');
    for (const [method, path] of ADMIN_ROUTES) {
      const anon = await (request(app) as unknown as Record<string, (p: string) => request.Test>)[method](path).send({});
      expect(anon.status, `${method.toUpperCase()} ${path} anonymous`).toBe(401);
      const aff = await (request(app) as unknown as Record<string, (p: string) => request.Test>)[method](path).set(auth(affiliate.token)).send({});
      expect(aff.status, `${method.toUpperCase()} ${path} affiliate`).toBe(403);
    }
  });

  it('does not let an admin sign in through the phone OTP flow', async () => {
    await request(app).post('/auth/otp/send').send({ phone: ADMIN_PHONE }).expect(200);
    await request(app).post('/auth/otp/verify').send({ phone: ADMIN_PHONE, otp: otps.get(e164(ADMIN_PHONE)) }).expect(403);
  });

  it('locks an admin email after 10 failed password attempts', async () => {
    await prisma.user.create({
      data: { email: 'guess-me@test.dev', phone: '+919811100012', role: 'admin', passwordHash: await bcrypt.hash('right-password', 4) },
    });
    for (let i = 0; i < 10; i++) {
      await request(app).post('/auth/admin/login').send({ email: 'guess-me@test.dev', password: `wrong-${i}` }).expect(401);
    }
    await request(app).post('/auth/admin/login').send({ email: 'guess-me@test.dev', password: 'right-password' }).expect(429);
  });

  it('takes a demotion into effect immediately, even with an old admin token', async () => {
    const temp = await prisma.user.create({
      data: { email: 'temp-admin@test.dev', phone: '+919811100011', role: 'admin', passwordHash: await bcrypt.hash('secret123', 4) },
    });
    const token = (await request(app).post('/auth/admin/login').send({ email: 'temp-admin@test.dev', password: 'secret123' }).expect(200)).body.token;
    await request(app).get('/admin/analytics').set(auth(token)).expect(200);
    await prisma.user.update({ where: { id: temp.id }, data: { role: 'affiliate' } });
    await request(app).get('/admin/analytics').set(auth(token)).expect(403);
  });
});

describe('7. Upload validation', () => {
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

  it('rejects files whose content does not match the declared type', async () => {
    const u = await login('9811100020');
    await request(app)
      .post('/kyc/documents')
      .set(auth(u.token))
      .field('type', 'other')
      .attach('file', Buffer.from('<html><script>alert(1)</script></html>'), { filename: 'evil.png', contentType: 'image/png' })
      .expect(400);
    await request(app)
      .post('/kyc/documents')
      .set(auth(u.token))
      .field('type', 'other')
      .attach('file', Buffer.from('<html></html>'), { filename: 'evil.html', contentType: 'text/html' })
      .expect(400);
  });

  it('ignores client path and extension in the filename', async () => {
    const u = await login('9811100021');
    const res = await request(app)
      .post('/kyc/documents')
      .set(auth(u.token))
      .field('type', 'other')
      .attach('file', PNG, { filename: '../../../evil.html', contentType: 'image/png' })
      .expect(201);
    const doc = await prisma.kycDocument.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(doc.storageKey).toMatch(new RegExp(`^kyc/${u.user.id}/other-[0-9a-f-]{36}\\.png$`));
    expect(doc.fileName).not.toContain('/');
    expect(doc.fileName).not.toContain('..');
  });
});

describe('8. Sessions', () => {
  it('logout revokes the token server-side', async () => {
    const u = await login('9811100030');
    await request(app).get('/me').set(auth(u.token)).expect(200);
    await request(app).post('/auth/logout').set(auth(u.token)).expect(204);
    await request(app).get('/me').set(auth(u.token)).expect(401);
  });

  it('issues 12h admin tokens and 7d affiliate tokens, HS256 only', async () => {
    const u = await login('9811100031');
    const a = jwt.decode(adminToken, { complete: true }) as jwt.Jwt & { payload: jwt.JwtPayload };
    const f = jwt.decode(u.token) as jwt.JwtPayload;
    expect(a.header.alg).toBe('HS256');
    expect(a.payload.exp! - a.payload.iat!).toBe(12 * 3600);
    expect(f.exp! - f.iat!).toBe(7 * 24 * 3600);
  });

  it('rejects an unsigned (alg=none) token', async () => {
    const u = await login('9811100032');
    const payload = jwt.decode(u.token) as jwt.JwtPayload;
    const forged = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ ...payload, role: 'admin' })).toString('base64url')}.`;
    await request(app).get('/me').set(auth(forged)).expect(401);
  });
});

describe('11. Other findings', () => {
  it('does not use the affiliate-supplied deal amount for percentage commissions', async () => {
    const u = await login('9811100040');
    // credit_card so this rule cannot leak into the loan-based money-flow test; deleted at the end.
    const rule = await request(app)
      .post('/admin/commission-rules')
      .set(auth(adminToken))
      .send({ productType: 'credit_card', commissionType: 'percent', value: 1, tier: 1 })
      .expect(201);
    const lead = await request(app)
      .post('/leads')
      .set(auth(u.token))
      .send({ productType: 'credit_card', leadName: 'Inflated', leadPhone: '9123400040', dealAmount: 1_90_00_000 })
      .expect(201);
    for (const s of ['contacted', 'in_progress']) {
      await request(app).patch(`/admin/leads/${lead.body.id}/status`).set(auth(adminToken)).send({ status: s }).expect(200);
    }
    await request(app).patch(`/admin/leads/${lead.body.id}/status`).set(auth(adminToken)).send({ status: 'converted' }).expect(400);
    const ok = await request(app)
      .patch(`/admin/leads/${lead.body.id}/status`)
      .set(auth(adminToken))
      .send({ status: 'converted', dealAmount: 100000 })
      .expect(200);
    expect(ok.body.commissions.find((c: { tier: number }) => c.tier === 1).amountPaise).toBe(100000); // 1% of ₹1,00,000
    await request(app).delete(`/admin/commission-rules/${rule.body.id}`).set(auth(adminToken)).expect(204);
  });

  it('masks phone numbers of downline members below level 1', async () => {
    const top = await login('9811100050');
    const code1 = (await request(app).get('/referrals/link').set(auth(top.token))).body.code;
    const mid = await login('9811100051', { referralCode: code1 });
    const code2 = (await request(app).get('/referrals/link').set(auth(mid.token))).body.code;
    await login('9811100052', { referralCode: code2 });
    const res = await request(app).get('/referrals/downline').set(auth(top.token)).expect(200);
    const byLevel = Object.fromEntries(res.body.members.map((m: { level: number; phone: string }) => [m.level, m.phone]));
    expect(byLevel[1]).toBe('+919811100051');
    expect(byLevel[2]).toBe('XXXXXXXXX0052');
  });

  it('never returns raw PAN or account numbers to the admin KYC view', async () => {
    const u = await login('9811100060');
    await request(app).post('/kyc/pan').set(auth(u.token)).send({ pan: 'ABCPE9876K' }).expect(200);
    await request(app).post('/kyc/bank').set(auth(u.token)).send({ accountNumber: '998877665544', ifsc: 'HDFC0001234' }).expect(200);
    const res = await request(app).get(`/admin/kyc/${u.user.id}`).set(auth(adminToken)).expect(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('ABCPE9876K');
    expect(body).not.toContain('998877665544');
    expect(res.body.kyc.panMasked).toBe('XXXXXX876K');
    expect(res.body.kyc.bankAccountMasked).toBe('XXXXXXXX5544');
  });

  it('rejects amounts that would overflow the 32-bit money columns with a 400, not a 500', async () => {
    const u = await login('9811100070');
    await request(app)
      .post('/leads')
      .set(auth(u.token))
      .send({ productType: 'loan', leadName: 'Too big', leadPhone: '9123400070', dealAmount: 99_00_00_000 })
      .expect(400);
  });

  it('validates the public referral-code lookup', async () => {
    await request(app).get(`/referrals/code/${'A'.repeat(200)}`).expect(400);
    await request(app).get('/referrals/code/abc$%25').expect(400);
  });
});
