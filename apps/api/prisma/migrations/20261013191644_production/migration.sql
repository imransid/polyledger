-- CreateEnum
CREATE TYPE "JobCardStatus" AS ENUM ('PLANNED', 'RELEASED', 'RUNNING', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Shift" AS ENUM ('A', 'B', 'C');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockDocumentKind" ADD VALUE 'ISSUE';
ALTER TYPE "StockDocumentKind" ADD VALUE 'PRODUCTION';
ALTER TYPE "StockDocumentKind" ADD VALUE 'HANDOVER';
ALTER TYPE "StockDocumentKind" ADD VALUE 'RETURN';

-- AlterTable
ALTER TABLE "moulds" ADD COLUMN     "runner_weight_mg" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "stock_documents" ADD COLUMN     "job_card_id" UUID;

-- CreateTable
CREATE TABLE "job_cards" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "product_id" UUID NOT NULL,
    "mould_id" UUID NOT NULL,
    "machine_id" UUID NOT NULL,
    "floor_location_id" UUID NOT NULL,
    "sales_order_id" UUID,
    "formula_version_id" UUID NOT NULL,
    "piece_weight_mg" INTEGER NOT NULL,
    "cavities" INTEGER NOT NULL,
    "runner_weight_mg" INTEGER NOT NULL,
    "planned_pieces" INTEGER NOT NULL,
    "planned_start_date" DATE NOT NULL,
    "status" "JobCardStatus" NOT NULL DEFAULT 'PLANNED',
    "cancel_reason" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "job_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_entries" (
    "id" UUID NOT NULL,
    "job_card_id" UUID NOT NULL,
    "shift_date" DATE NOT NULL,
    "shift" "Shift" NOT NULL,
    "operator_id" UUID NOT NULL,
    "shot_start" INTEGER NOT NULL,
    "shot_end" INTEGER NOT NULL,
    "good_pieces" INTEGER NOT NULL,
    "rejected_pieces" INTEGER NOT NULL,
    "stock_document_id" UUID NOT NULL,
    "reversed_at" TIMESTAMPTZ(3),
    "recorded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_entry_materials" (
    "entry_id" UUID NOT NULL,
    "raw_material_id" UUID NOT NULL,
    "piece_grams" INTEGER NOT NULL,
    "runner_grams" INTEGER NOT NULL,

    CONSTRAINT "production_entry_materials_pkey" PRIMARY KEY ("entry_id","raw_material_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_cards_number_key" ON "job_cards"("number");

-- CreateIndex
CREATE INDEX "job_cards_status_idx" ON "job_cards"("status");

-- CreateIndex
CREATE UNIQUE INDEX "job_cards_one_running_per_machine" ON "job_cards"("machine_id") WHERE ("status" = 'RUNNING');

-- CreateIndex
CREATE UNIQUE INDEX "job_cards_one_running_per_mould" ON "job_cards"("mould_id") WHERE ("status" = 'RUNNING');

-- CreateIndex
CREATE UNIQUE INDEX "production_entries_stock_document_id_key" ON "production_entries"("stock_document_id");

-- CreateIndex
CREATE INDEX "production_entries_job_card_id_idx" ON "production_entries"("job_card_id");

-- CreateIndex
CREATE UNIQUE INDEX "production_entries_one_per_shift" ON "production_entries"("job_card_id", "shift_date", "shift") WHERE ("reversed_at" IS NULL);

-- CreateIndex
CREATE INDEX "stock_documents_job_card_id_idx" ON "stock_documents"("job_card_id");

-- AddForeignKey
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_job_card_id_fkey" FOREIGN KEY ("job_card_id") REFERENCES "job_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_mould_id_fkey" FOREIGN KEY ("mould_id") REFERENCES "moulds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_floor_location_id_fkey" FOREIGN KEY ("floor_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_formula_version_id_fkey" FOREIGN KEY ("formula_version_id") REFERENCES "formula_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_entries" ADD CONSTRAINT "production_entries_job_card_id_fkey" FOREIGN KEY ("job_card_id") REFERENCES "job_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_entries" ADD CONSTRAINT "production_entries_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_entries" ADD CONSTRAINT "production_entries_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_entry_materials" ADD CONSTRAINT "production_entry_materials_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "production_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "moulds" ADD CONSTRAINT "moulds_runner_weight_not_negative" CHECK ("runner_weight_mg" >= 0);

ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_quantities" CHECK ("planned_pieces" > 0 AND "piece_weight_mg" > 0 AND "cavities" > 0 AND "runner_weight_mg" >= 0);

ALTER TABLE "production_entries" ADD CONSTRAINT "production_entries_counts" CHECK ("shot_end" >= "shot_start" AND "shot_start" >= 0 AND "good_pieces" >= 0 AND "rejected_pieces" >= 0);

ALTER TABLE "production_entry_materials" ADD CONSTRAINT "production_entry_materials_not_negative" CHECK ("piece_grams" >= 0 AND "runner_grams" >= 0);

-- JC-000001, ISS-000001, PRD-000001, FGH-000001, RET-000001.
CREATE SEQUENCE "job_card_number";
CREATE SEQUENCE "stock_document_number_issue";
CREATE SEQUENCE "stock_document_number_production";
CREATE SEQUENCE "stock_document_number_handover";
CREATE SEQUENCE "stock_document_number_return";
