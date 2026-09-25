# 01 — Product requirements (as built)

## Vision

Refera turns people's personal networks into a distribution channel for financial products. An **affiliate** refers
friends and contacts who want a **loan, credit card or insurance**. The platform tracks each referral as a **lead**
through a sales pipeline. When a lead converts, the affiliate earns a commission, and so do the people above them in the
referral tree. Affiliates withdraw earnings to a bank account once they pass **KYC** (Aadhaar, PAN and bank
verification).

The product types are fixed in the schema: `ProductType = loan | credit_card | insurance` (`services/api/prisma/schema.prisma`).

## User roles

Defined by `enum Role { affiliate, admin }`.

| Role | Signs in with | Client |
|---|---|---|
| **Affiliate** | Phone number + OTP (`POST /auth/otp/send`, `/auth/otp/verify`) | Mobile app (`apps/mobile`) |
| **Admin** | Email + password (`POST /auth/admin/login`). The phone OTP flow is refused for admins (403). | Admin panel (`services/admin-dashboard`) |
| *Lead (not a user)* | — | Stored in `leads`, never logs in. A public capture endpoint exists but no page uses it. |

## User stories — Affiliate

Each story below is supported end to end by an API route **and** a mobile screen, unless it says otherwise.

**Account**
- Sign up or log in with an Indian mobile number and an OTP. (`PhoneScreen`, `OtpScreen`)
- Optionally enter a name and a referral code on first signup, and see who invited you before submitting. The code is
  only applied when creating a new account. (`OtpScreen` → `GET /referrals/code/:code`)
- Edit your name and email. (`ProfileScreen` → `PATCH /me`)
- Log out, which revokes all of your sessions on the server. (`ProfileScreen` → `POST /auth/logout`)

**Earn**
- See the current offers: every active commission rule, with its title, amount and description. Direct referral offers
  are shown separately from team bonuses. (`HomeScreen` preview, `OffersScreen` → `GET /offers`)
- Start a lead straight from an offer, with its product already selected. (`OfferCard` → `NewLeadScreen`)
- See your balance, pending commissions, total earned, and lead counts by status. (`HomeScreen`)

**Refer & team**
- See and share your referral code and link, and copy the code. (`ReferralsScreen` → `GET /referrals/link`)
- See your team up to 3 levels deep, with KYC status and lead counts. Phone numbers are shown in full only for people
  you invited directly (level 1). (`ReferralsScreen` → `GET /referrals/downline`)

**Leads**
- Submit a lead: product, customer name, mobile, an optional amount estimate and optional notes.
  (`NewLeadScreen` → `POST /leads`)
- List your leads, filter by status, search by name or phone, and page through. (`LeadsScreen` → `GET /leads`)
- See a lead's detail: pipeline progress, your commission on it, and a call button. (`LeadDetailScreen` → `GET /leads/:id`)

**KYC**
- Verify Aadhaar with an OTP, then PAN, then bank account (penny-drop). (`KycScreen` → `/kyc/*`)
- Upload supporting documents (PAN card, bank proof) as JPG, PNG or PDF up to 5 MB. (`KycScreen` → `POST /kyc/documents`)
- See the KYC status (not verified, under review, verified, or action needed) and any rejection reason.

**Money**
- See your ledger history, commissions and payouts. (`EarningsScreen` → `/earnings/*`)
- Request a withdrawal once KYC is verified and your balance is at least the minimum (default ₹100).
  (`EarningsScreen` → `POST /earnings/payouts`)
- Receive push notifications on lead status changes, commissions, payouts and KYC decisions. **Stubbed:** see below.

## User stories — Admin

- Sign in with email and password. Sessions last 12 hours. (`LoginPage`)
- See platform analytics: affiliates, KYC, leads by status, commission totals, open payouts, and signups over 30 days.
  (`DashboardPage` → `GET /admin/analytics`)
- Work the lead queue: move leads through the pipeline, reject them, and convert them with a **confirmed** final deal
  amount, which creates commissions. (`LeadsPage` → `PATCH /admin/leads/:id/status`)
- Review KYC: see the check flags, masked PAN and account number, and documents; then approve, or reject with a reason.
  (`KycPage` → `/admin/kyc/*`)
- Approve or reject pending commissions. Approving credits the affiliate's ledger. (`CommissionsPage`)
- Process payouts: start processing, mark as paid with a bank reference (UTR), or mark as failed, which automatically
  refunds the balance. (`PayoutsPage`)
- Manage commission rules and offers: product, flat or percent, amount, tier, offer title and description; plus edit,
  pause, activate and delete. (`RulesPage` → `/admin/commission-rules`)
- Browse and search affiliates, filtered by KYC state. This view is read-only. (`UsersPage` → `GET /admin/users`)

**API exists, no UI yet:** `GET /admin/users/:id` (user detail with balance), `POST /leads/public` (lead capture from a
shared link; there is no landing page), and `DELETE /me/devices`.

## Out of scope / stubbed

| Area | Current behaviour | Where |
|---|---|---|
| **SMS / OTP delivery** | `ConsoleSmsProvider` prints the OTP to the API terminal. With `TEST_OTP=1234` (dev only), every OTP is 1234. | `services/api/src/providers/sms.ts` |
| **KYC provider** | `MockKycProvider`: the Aadhaar OTP is `TEST_OTP` (default 1234); a PAN with `X` as its 5th letter fails; an account number ending in `0000` fails. Other providers are named in config but **not implemented**, and selecting one makes startup throw. | `services/api/src/providers/kyc.ts` |
| **Document storage** | Local disk (`./uploads`) served through HMAC-signed, expiring URLs. An S3 implementation exists but has **never been run against AWS**. | `services/api/src/providers/storage.ts` |
| **Push notifications** | `ConsolePushProvider` logs to the terminal. An FCM implementation exists but has **never been run with real Firebase credentials**. The mobile app skips push registration inside Expo Go. | `services/api/src/providers/push.ts`, `apps/mobile/src/notifications.ts` |
| **Payouts** | **No provider or adapter.** An admin transfers the money outside the system and then records the UTR (`POST /admin/payouts/:id/complete`). | `services/api/src/modules/payouts/payout.service.ts` |
| Landing page for referral links | Not built. `REFERRAL_BASE_URL` points to `https://refera.app/r/<code>`, which doesn't exist. | — |
| Multi-language, iOS release, web app for affiliates | Not built. | — |
| Admin roles and permissions beyond "admin"; audit log of admin actions | Not built. | — |
| Account deletion / data export | Not built. | — |
| Hosting / deployment | Not done. Everything is local-only. | — |

## Success criteria for a demo

These are proposed criteria, not requirements taken from a client document.

1. A new affiliate signs up on a real Android phone with OTP 1234, using another affiliate's referral code.
2. From an offer card, they submit a loan lead.
3. In the admin panel, the lead moves new → contacted → in progress → converted with a deal amount. Pending commissions
   appear for the affiliate (tier 1) and their upline (tier 2).
4. The admin approves the commission, and the affiliate's balance goes up on Home and Earnings.
5. The affiliate completes KYC (Aadhaar 1234, any valid-format PAN, any account not ending in 0000, plus one document),
   and the admin approves it.
6. The affiliate withdraws. The admin marks it paid with a UTR, and the affiliate sees it as completed, with the ledger
   showing credit, debit and the balance after each.
7. A second withdrawal is failed by the admin, and the money returns to the affiliate's balance as a reversal entry.

Steps 2–7 are covered at the API level by `test/flow.test.ts > runs the whole money flow end to end`. The full demo
**on real devices has not been performed yet**.
