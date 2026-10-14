-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'GUARD';

-- CreateTable
CREATE TABLE "company_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "bin" TEXT,
    "updated_by_id" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One row only, and a BIN is exactly 13 digits.
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_single_row" CHECK ("id" = 1);
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_bin_digits" CHECK ("bin" ~ '^[0-9]{13}$');
