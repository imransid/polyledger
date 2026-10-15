-- CreateEnum
CREATE TYPE "SyncRecordKind" AS ENUM ('PRODUCTION_ENTRY', 'WASTE_ENTRY');

-- CreateEnum
CREATE TYPE "SyncRecordStatus" AS ENUM ('ACCEPTED', 'REJECTED', 'RESOLVED', 'DISMISSED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "pin_hash" TEXT;

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "floor_location_id" UUID NOT NULL,
    "token_hash" TEXT,
    "pairing_code_hash" TEXT,
    "pairing_expires_at" TIMESTAMPTZ(3),
    "paired_at" TIMESTAMPTZ(3),
    "last_seen_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_sessions" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "device_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pin_attempts" (
    "device_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),

    CONSTRAINT "pin_attempts_pkey" PRIMARY KEY ("device_id","user_id")
);

-- CreateTable
CREATE TABLE "synced_records" (
    "id" UUID NOT NULL,
    "kind" "SyncRecordKind" NOT NULL,
    "device_id" UUID NOT NULL,
    "session_id" UUID,
    "recorded_by_id" UUID,
    "job_card_id" UUID,
    "payload" JSONB NOT NULL,
    "device_recorded_at" TIMESTAMPTZ(3),
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "SyncRecordStatus" NOT NULL,
    "reason" TEXT,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "review_note" TEXT,

    CONSTRAINT "synced_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "devices_token_hash_key" ON "devices"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "devices_pairing_code_hash_key" ON "devices"("pairing_code_hash");

-- CreateIndex
CREATE INDEX "device_sessions_device_id_idx" ON "device_sessions"("device_id");

-- CreateIndex
CREATE INDEX "synced_records_status_received_at_idx" ON "synced_records"("status", "received_at");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_floor_location_id_fkey" FOREIGN KEY ("floor_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_sessions" ADD CONSTRAINT "device_sessions_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_sessions" ADD CONSTRAINT "device_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pin_attempts" ADD CONSTRAINT "pin_attempts_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pin_attempts" ADD CONSTRAINT "pin_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "synced_records" ADD CONSTRAINT "synced_records_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "synced_records" ADD CONSTRAINT "synced_records_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "device_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "synced_records" ADD CONSTRAINT "synced_records_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "synced_records" ADD CONSTRAINT "synced_records_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A record the server refused always says why.
ALTER TABLE "synced_records" ADD CONSTRAINT "synced_records_reason" CHECK ("status" = 'ACCEPTED' OR "reason" IS NOT NULL);

ALTER TABLE "pin_attempts" ADD CONSTRAINT "pin_attempts_failures" CHECK ("failures" >= 0);
