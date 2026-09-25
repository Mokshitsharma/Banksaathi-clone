# Refera API reference

Base URL: `http://localhost:4000`. JSON in and out. Authenticated routes need `Authorization: Bearer <jwt>`.
Errors look like `{ "error": { "code": "BAD_REQUEST", "message": "...", "details": [...] } }`.
Money in responses is in **paise** (`*Paise` fields). Request bodies take **rupees** (`amount`, `dealAmount`, rule `value`).
List endpoints accept `page` and `pageSize` (max 100) and return `{ items, total, page, pageSize }`.

## Auth
| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/auth/otp/send` | `{ phone }` | 10-digit Indian mobile. 30 s resend cooldown, max 5 per hour. |
| POST | `/auth/otp/verify` | `{ phone, otp, name?, referralCode? }` | Returns `{ token, user, isNewUser }`. The referral code only applies at signup. |
| POST | `/auth/admin/login` | `{ email, password }` | Admin accounts only. |

## Me
| GET | `/me` | Current user |
|---|---|---|
| PATCH | `/me` | `{ name?, email? }` |
| POST | `/me/devices` | `{ token, platform: android\|ios\|web }`: registers an FCM token |
| DELETE | `/me/devices` | `{ token }` |

## Referrals
| GET | `/referrals/code/:code` | Public: validates a code and returns the referrer's name |
|---|---|---|
| GET | `/referrals/link` | `{ code, url }` |
| GET | `/referrals/downline?depth=3` | `{ members[], counts: { level: n } }` |

## Leads
| POST | `/leads/public` | Public capture: `{ referralCode, productType, leadName, leadPhone, notes? }` |
|---|---|---|
| POST | `/leads` | `{ productType: loan\|credit_card\|insurance, leadName, leadPhone, notes?, dealAmount? }` |
| GET | `/leads?status=&productType=&search=` | Affiliates see their own leads. Admins see all and can also pass `referrerId`. |
| GET | `/leads/stats` | Count of your leads by status |
| GET | `/leads/:id` | Includes `allowedTransitions` and your commissions |

The pipeline is `new → contacted → in_progress → converted`. `rejected` can be reached from any open status.

## Earnings
| GET | `/earnings/summary` | `pendingPaise, approvedPaise, paidPaise, inProcessPayoutPaise, availableBalancePaise, totalEarnedPaise, minPayoutPaise` |
|---|---|---|
| GET | `/earnings/commissions?status=` | |
| GET | `/earnings/ledger` | Immutable ledger, newest first |
| GET | `/earnings/payouts` | |
| POST | `/earnings/payouts` | `{ amount }` in rupees. Requires verified KYC; debits the ledger. |

## KYC
| GET | `/kyc` | Status, check flags, masked PAN and bank details, documents with signed URLs |
|---|---|---|
| POST | `/kyc/aadhaar/otp` | `{ aadhaarNumber }`: never stored |
| POST | `/kyc/aadhaar/verify` | `{ otp }` |
| POST | `/kyc/pan` | `{ pan, name? }` |
| POST | `/kyc/bank` | `{ accountNumber, ifsc }`: penny-drop |
| POST | `/kyc/documents` | multipart: `type` (pan_card\|bank_proof\|other) and `file` (JPG, PNG or PDF, up to 5 MB) |

Once all three checks pass, `kycStatus` becomes `pending` and an admin approves it (`verified`) or rejects it (`rejected`,
which resets the checks).

## Admin (role = admin)
| GET | `/admin/analytics` |
|---|---|
| GET | `/admin/users?search=&kycStatus=&role=` · `/admin/users/:id` |
| PATCH | `/admin/leads/:id/status` `{ status, dealAmount?, notes? }`: converting creates commissions |
| GET | `/admin/kyc?status=pending` · `/admin/kyc/:userId` |
| POST | `/admin/kyc/:userId/approve` · `/admin/kyc/:userId/reject` `{ reason }` |
| GET/POST | `/admin/commission-rules` `{ productType, commissionType: flat\|percent, value, tier, active? }`: value is ₹ for flat rules, % for percent rules |
| PATCH/DELETE | `/admin/commission-rules/:id` |
| GET | `/admin/commissions?status=` |
| POST | `/admin/commissions/:id/approve` (credits the ledger) · `/admin/commissions/:id/reject` |
| GET | `/admin/payouts?status=` |
| POST | `/admin/payouts/:id/process` · `/admin/payouts/:id/complete` `{ transactionRef }` · `/admin/payouts/:id/fail` `{ reason }` (reverses the debit) |
