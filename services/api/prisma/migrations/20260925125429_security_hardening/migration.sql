-- AlterTable
ALTER TABLE "kyc_records" ADD COLUMN     "aadhaar_otp_attempts" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "token_version" INTEGER NOT NULL DEFAULT 0;
