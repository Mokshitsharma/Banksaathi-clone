# Refera — project brain

This folder is the written picture of what the code **does today**. It was produced by reading the actual source on
2026-09-25, after the security audit and its fixes were applied (see `05-SECURITY.md`). Where something is inferred or
not verified, the file says so. If code and these docs disagree, the code wins. Please update the docs in the same PR.

| File | What it answers |
|---|---|
| [01-PRD.md](01-PRD.md) | What the product is for, who uses it, what each role can do, and what is stubbed |
| [02-TRD.md](02-TRD.md) | Stack, full data model, every API route, server-enforced business rules, and test coverage |
| [03-WORKFLOWS.md](03-WORKFLOWS.md) | Every screen in the mobile app and admin panel, with every button and what it calls |
| [04-ARCHITECTURE.md](04-ARCHITECTURE.md) | System diagram, component boundaries, provider adapters, money flow, and deployment status |
| [05-SECURITY.md](05-SECURITY.md) | Security audit results, what was fixed, and the prioritised open list |

## Current state in one paragraph

A monorepo with an Express + Prisma + PostgreSQL API (`services/api`), an Expo React Native affiliate app
(`apps/mobile`) and a React + Vite admin panel (`services/admin-dashboard`). It runs **only on the developer's machine**.
Nothing is deployed. SMS, KYC verification, push notifications and payouts are stand-ins: SMS and push log to the
console, KYC is a mock that accepts OTP `1234`, and admins mark payouts as paid by hand. Document storage has a working
local-disk implementation and an S3 implementation that has never been run against AWS. The API has 38 automated tests,
all passing. The mobile app has been type-checked and bundled but **never run on a phone**. The admin panel has been
built but **never opened in a browser** by the author of these docs.

## Fastest next actions

1. **Click through the apps by hand.** Run the admin panel in a browser and the mobile app in Expo Go on an Android
   phone, then do one full lead → commission → KYC → payout cycle. This is the biggest unverified area (see "verified
   live vs tested" in `02-TRD.md`).
2. **Pick the real providers.** Choose one each for SMS (MSG91 or Twilio), KYC (Digio, Karza, Signzy or HyperVerge) and
   payouts (Razorpay or Cashfree). Implement the interfaces listed in `04-ARCHITECTURE.md`. Payouts have **no adapter
   yet**, so that one needs designing.
3. **Work the open security items in order**, starting with `05-SECURITY.md` item O1: move the rate limiters to a shared
   store before running more than one API instance.
4. **Decide on money column size.** Amounts are 32-bit INTEGER paise, so single amounts are capped at ₹2 crore. Migrate
   to BIGINT if larger loans are in scope.
5. **Choose hosting.** Set up the database and API hosting, then build the Android app with EAS.

## Running it locally

See the repo `README.md`. In short: `scripts/db-start.ps1`, then `npm run dev` in `services/api` and
`services/admin-dashboard`, and `npx expo start` in `apps/mobile`. In development every OTP is `1234` (`TEST_OTP`).
