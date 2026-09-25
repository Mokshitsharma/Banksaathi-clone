# Refera

A fintech referral and lead-conversion platform. Affiliates refer people for loans, credit cards and insurance. Admins
move leads through a pipeline, and converted leads pay multi-level commissions into an append-only ledger.
Affiliates who pass KYC (Aadhaar, PAN and bank) can withdraw their earnings.

```
apps/mobile               React Native (Expo SDK 57) affiliate app
services/api              Express 5 + Prisma 6 + PostgreSQL backend
services/admin-dashboard  React + Vite admin panel
packages/shared-types     Type-only API contracts shared by all three
docs/api-spec.md          Endpoint reference
scripts/                  Local PostgreSQL start/stop helpers
```

## Quick start (Windows, this machine)

PostgreSQL 16 is installed as a portable copy at `E:\tools\pg16`, with its data in `E:\tools\pgdata`.
User `refera`, password `refera`, database `refera` on port 5432.

```powershell
# 1. Database (after a reboot)
powershell -ExecutionPolicy Bypass -File E:\Banksaathi-clone\scripts\db-start.ps1

# 2. API  →  http://localhost:4000
cd E:\Banksaathi-clone\services\api
npm run dev

# 3. Admin panel  →  http://localhost:5173   (admin@refera.app / Admin@12345)
cd E:\Banksaathi-clone\services\admin-dashboard
npm run dev

# 4. Mobile app: scan the QR code with Expo Go
cd E:\Banksaathi-clone\apps\mobile
npx expo start
```

**Test OTP:** in development every login OTP is **1234**, and so is the mock Aadhaar OTP. This comes from
`TEST_OTP=1234` in `services/api/.env`. Clear that value to get random 6-digit OTPs, which are printed in the API terminal.
The server refuses to start in production while `TEST_OTP` is set.

### Testing on your Android phone

1. Install **Expo Go** from the Play Store.
2. Connect the phone to the same Wi-Fi network as this PC.
3. `apps/mobile/.env` must contain this PC's Wi-Fi IP, e.g. `EXPO_PUBLIC_API_URL=http://10.250.56.181:4000`.
   Run `ipconfig` if your IP changes, then restart `npx expo start`.
4. If the phone can't connect, allow Node.js through Windows Firewall on private networks (port 4000 for the API,
   8081 for Metro). If you're on different networks, use `npx expo start --tunnel` and an ngrok URL for the API.

## Backend (`services/api`)

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with reload |
| `npm test` | Integration tests against the `refera_test` database (created automatically) |
| `npm run db:migrate` | Create and apply a migration after editing `prisma/schema.prisma` |
| `npm run db:seed` | Create the admin user and default commission rules |
| `npm run db:studio` | Browse data in Prisma Studio |
| `npm run build && npm start` | Production build |

All configuration lives in `.env`. See `.env.example` for every variable, with comments.

### How money works
- All amounts are stored as **integer paise**, so there are no floating-point errors. The API accepts rupees on input.
- **Commission rules** are set per product and tier. A rule is either a flat amount or a percentage of the deal amount
  (stored in basis points). Tier 1 pays the referrer, tier 2 pays the person who invited them, and so on.
- When a lead moves to `converted`, a `pending` commission is created for each matching rule.
- When an admin **approves** a commission, the affiliate's ledger is credited and the money becomes withdrawable.
- A **payout request** debits the ledger immediately. If the payout fails, a `payout_reversal` credit returns the money.
  When it completes, the oldest approved commissions are marked `paid`.
- `ledger_entries` is **append-only**. A database trigger rejects any UPDATE or DELETE, and a CHECK constraint keeps
  balances at zero or above. Concurrent requests are serialised by locking the user's row.

### Swappable providers (`src/providers/`)
| Concern | Default (dev) | Production swap |
|---|---|---|
| SMS / OTP | `console`: logs the OTP | Add an MSG91 or Twilio adapter in `sms.ts` |
| KYC | `mock`: OTP 1234; a PAN with X as the 5th letter fails; an account ending in 0000 fails | Implement `KycProvider` for Digio, Karza, Signzy or HyperVerge in `kyc.ts` |
| Documents | `local`: `./uploads` plus HMAC-signed expiring URLs | `STORAGE_PROVIDER=s3` (private bucket, pre-signed URLs, SSE) |
| Push | `console` | `PUSH_PROVIDER=fcm` + `FIREBASE_SERVICE_ACCOUNT_PATH` |

**KYC data handling:** raw Aadhaar numbers are never stored; only the provider's reference ID is kept. PAN and bank
account numbers are encrypted with AES-256-GCM (`DATA_ENCRYPTION_KEY`), and only masked values are ever returned.

## Mobile app (`apps/mobile`)
- Home shows an **Offers** preview, and **See all** opens the Offers screen. Each active commission rule is a card with its title,
  amount and description. Direct offers open "New lead" with that product selected; team bonuses link to the Refer tab.
- Tabs: Home, Refer (code, share sheet, team downline), Leads (list, filters, detail, new lead), Earnings (balance,
  withdraw, history, commissions, payouts), Profile (edit profile, KYC flow with document upload).
- The session token is stored in `expo-secure-store`.
- **Push notifications** don't work in Expo Go on Android. Build a development client (`npx expo run:android` or EAS)
  with a `google-services.json` to receive FCM pushes. Everything else works in Expo Go.

## Admin panel (`services/admin-dashboard`)
Overview analytics, lead queue (move through the pipeline and convert with a deal amount), KYC review (checks,
documents, approve or reject), commission approval, payouts (process, mark paid with a UTR, or fail with automatic
reversal), commission rules with an offer title and description (edit any rule's copy) and an affiliate directory.

## Still to decide
- KYC provider (Digio, Karza/Perfios, Signzy or HyperVerge): implement the `KycProvider` interface.
- SMS provider (MSG91 or Twilio): implement `SmsProvider`.
- Payout provider (Razorpay Payouts or Cashfree Payouts). Payouts are currently marked paid by hand with a UTR.
