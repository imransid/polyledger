-- CreateEnum
CREATE TYPE "WasteType" AS ENUM ('RUNNER', 'REJECT', 'PURGE', 'SWEEPINGS');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockDocumentKind" ADD VALUE 'WASTE';
ALTER TYPE "StockDocumentKind" ADD VALUE 'GRINDING';
ALTER TYPE "StockDocumentKind" ADD VALUE 'SCRAP_SALE';
ALTER TYPE "StockDocumentKind" ADD VALUE 'SCRAP_TRANSFER';

-- CreateTable
CREATE TABLE "waste_entries" (
    "id" UUID NOT NULL,
    "job_card_id" UUID NOT NULL,
    "shift_date" DATE NOT NULL,
    "shift" "Shift" NOT NULL,
    "waste_material_id" UUID NOT NULL,
    "scrap_location_id" UUID NOT NULL,
    "stock_document_id" UUID NOT NULL,
    "reversed_at" TIMESTAMPTZ(3),
    "recorded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waste_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waste_entry_lines" (
    "entry_id" UUID NOT NULL,
    "waste_type" "WasteType" NOT NULL,
    "grams" INTEGER NOT NULL,

    CONSTRAINT "waste_entry_lines_pkey" PRIMARY KEY ("entry_id","waste_type")
);

-- CreateTable
CREATE TABLE "grinding_batches" (
    "id" UUID NOT NULL,
    "stock_document_id" UUID NOT NULL,
    "scrap_location_id" UUID NOT NULL,
    "store_location_id" UUID NOT NULL,
    "input_item_type" "StockItemType" NOT NULL,
    "input_item_id" UUID NOT NULL,
    "input_pieces" INTEGER,
    "input_grams" INTEGER NOT NULL,
    "output_material_id" UUID NOT NULL,
    "output_grams" INTEGER NOT NULL,
    "ground_on" DATE NOT NULL,
    "reversed_at" TIMESTAMPTZ(3),
    "recorded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grinding_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scrap_sales" (
    "id" UUID NOT NULL,
    "stock_document_id" UUID NOT NULL,
    "buyer_name" TEXT NOT NULL,
    "sold_on" DATE NOT NULL,
    "scrap_location_id" UUID NOT NULL,
    "reversed_at" TIMESTAMPTZ(3),
    "recorded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scrap_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scrap_sale_lines" (
    "sale_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "item_type" "StockItemType" NOT NULL,
    "item_id" UUID NOT NULL,
    "pieces" INTEGER,
    "grams" INTEGER NOT NULL,
    "price_per_kg_poisha" INTEGER NOT NULL,
    "amount_poisha" INTEGER NOT NULL,

    CONSTRAINT "scrap_sale_lines_pkey" PRIMARY KEY ("sale_id","line_no")
);

-- CreateIndex
CREATE UNIQUE INDEX "waste_entries_stock_document_id_key" ON "waste_entries"("stock_document_id");

-- CreateIndex
CREATE INDEX "waste_entries_job_card_id_idx" ON "waste_entries"("job_card_id");

-- CreateIndex
CREATE UNIQUE INDEX "waste_entries_one_per_shift" ON "waste_entries"("job_card_id", "shift_date", "shift") WHERE ("reversed_at" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "grinding_batches_stock_document_id_key" ON "grinding_batches"("stock_document_id");

-- CreateIndex
CREATE INDEX "grinding_batches_ground_on_idx" ON "grinding_batches"("ground_on");

-- CreateIndex
CREATE UNIQUE INDEX "scrap_sales_stock_document_id_key" ON "scrap_sales"("stock_document_id");

-- CreateIndex
CREATE INDEX "scrap_sales_sold_on_idx" ON "scrap_sales"("sold_on");

-- AddForeignKey
ALTER TABLE "waste_entries" ADD CONSTRAINT "waste_entries_job_card_id_fkey" FOREIGN KEY ("job_card_id") REFERENCES "job_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_entries" ADD CONSTRAINT "waste_entries_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_entry_lines" ADD CONSTRAINT "waste_entry_lines_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "waste_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grinding_batches" ADD CONSTRAINT "grinding_batches_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrap_sales" ADD CONSTRAINT "scrap_sales_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrap_sale_lines" ADD CONSTRAINT "scrap_sale_lines_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "scrap_sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "waste_entry_lines" ADD CONSTRAINT "waste_entry_lines_positive" CHECK ("grams" > 0);

-- Grinding never makes material: the loss (input - output) is zero or more.
ALTER TABLE "grinding_batches" ADD CONSTRAINT "grinding_batches_quantities" CHECK ("output_grams" >= 0 AND "output_grams" <= "input_grams" AND ("input_pieces" IS NULL OR "input_pieces" > 0));

ALTER TABLE "scrap_sale_lines" ADD CONSTRAINT "scrap_sale_lines_quantities" CHECK ("grams" > 0 AND "price_per_kg_poisha" >= 0 AND "amount_poisha" >= 0 AND ("pieces" IS NULL OR "pieces" > 0));

-- WST-000001, GRD-000001, SCR-000001 and SCT-000001 for products sent to scrap.
CREATE SEQUENCE "stock_document_number_waste";
CREATE SEQUENCE "stock_document_number_grinding";
CREATE SEQUENCE "stock_document_number_scrap_sale";
CREATE SEQUENCE "stock_document_number_scrap_transfer";
