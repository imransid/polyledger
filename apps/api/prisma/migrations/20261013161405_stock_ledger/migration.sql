-- CreateEnum
CREATE TYPE "LocationKind" AS ENUM ('RAW_MATERIAL_STORE', 'PRODUCTION_FLOOR', 'FINISHED_GOODS_STORE', 'SCRAP_YARD');

-- CreateEnum
CREATE TYPE "StockDocumentKind" AS ENUM ('RECEIPT', 'TRANSFER', 'ADJUSTMENT', 'OPENING', 'REVERSAL');

-- CreateEnum
CREATE TYPE "StockItemType" AS ENUM ('RAW_MATERIAL', 'PRODUCT');

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "LocationKind" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_documents" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "kind" "StockDocumentKind" NOT NULL,
    "supplier_id" UUID,
    "supplier_reference" TEXT,
    "received_on" DATE,
    "reason" TEXT,
    "reverses_id" UUID,
    "reversed_at" TIMESTAMPTZ(3),
    "posted_by_id" UUID NOT NULL,
    "posted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_lines" (
    "document_id" UUID NOT NULL,
    "raw_material_id" UUID NOT NULL,
    "challan_grams" INTEGER NOT NULL,
    "received_grams" INTEGER NOT NULL,

    CONSTRAINT "receipt_lines_pkey" PRIMARY KEY ("document_id","raw_material_id")
);

-- CreateTable
CREATE TABLE "stock_ledger" (
    "id" SERIAL NOT NULL,
    "document_id" UUID NOT NULL,
    "item_type" "StockItemType" NOT NULL,
    "item_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "movement_type" "StockDocumentKind" NOT NULL,
    "grams" INTEGER NOT NULL,
    "pieces" INTEGER,
    "reversal_of_id" INTEGER,
    "posted_by_id" UUID NOT NULL,
    "posted_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stock_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_balances" (
    "item_type" "StockItemType" NOT NULL,
    "item_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "grams" BIGINT NOT NULL DEFAULT 0,
    "pieces" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("item_type","item_id","location_id")
);

-- CreateTable
CREATE TABLE "outbox" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(3),

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "locations_code_key" ON "locations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "stock_documents_number_key" ON "stock_documents"("number");

-- CreateIndex
CREATE UNIQUE INDEX "stock_documents_reverses_id_key" ON "stock_documents"("reverses_id");

-- CreateIndex
CREATE INDEX "stock_documents_kind_posted_at_idx" ON "stock_documents"("kind", "posted_at");

-- CreateIndex
CREATE UNIQUE INDEX "stock_documents_one_open_receipt_per_challan" ON "stock_documents"("supplier_id", "supplier_reference") WHERE ("kind" = 'RECEIPT' AND "reversed_at" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "stock_ledger_reversal_of_id_key" ON "stock_ledger"("reversal_of_id");

-- CreateIndex
CREATE INDEX "stock_ledger_item_type_item_id_location_id_idx" ON "stock_ledger"("item_type", "item_id", "location_id");

-- CreateIndex
CREATE INDEX "stock_ledger_document_id_idx" ON "stock_ledger"("document_id");

-- AddForeignKey
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_posted_by_id_fkey" FOREIGN KEY ("posted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_reverses_id_fkey" FOREIGN KEY ("reverses_id") REFERENCES "stock_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "stock_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "stock_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_posted_by_id_fkey" FOREIGN KEY ("posted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "stock_ledger"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Stock can never go below zero, even if a code path forgets to check.
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_not_negative" CHECK ("grams" >= 0 AND "pieces" >= 0);

-- Products move in pieces as well as grams; raw materials in grams only.
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_pieces_for_products" CHECK (("item_type" = 'PRODUCT') = ("pieces" IS NOT NULL));

ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_quantities" CHECK ("challan_grams" > 0 AND "received_grams" >= 0);

-- Mistakes are fixed with reversal entries, never by changing history.
CREATE FUNCTION "stock_ledger_is_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'stock_ledger is append-only; post a reversal instead';
END;
$$;

CREATE TRIGGER "stock_ledger_no_update_or_delete"
  BEFORE UPDATE OR DELETE ON "stock_ledger"
  FOR EACH ROW EXECUTE FUNCTION "stock_ledger_is_append_only"();

CREATE TRIGGER "stock_ledger_no_truncate"
  BEFORE TRUNCATE ON "stock_ledger"
  FOR EACH STATEMENT EXECUTE FUNCTION "stock_ledger_is_append_only"();

-- Document numbers: GRN-000001, TRF-000001, ... A failed post can skip one.
CREATE SEQUENCE "stock_document_number_receipt";
CREATE SEQUENCE "stock_document_number_transfer";
CREATE SEQUENCE "stock_document_number_adjustment";
CREATE SEQUENCE "stock_document_number_opening";
CREATE SEQUENCE "stock_document_number_reversal";

INSERT INTO "locations" ("id", "code", "name", "kind", "updated_at") VALUES
  (gen_random_uuid(), 'RM-STORE', 'Main raw material store', 'RAW_MATERIAL_STORE', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'FLOOR', 'Production floor', 'PRODUCTION_FLOOR', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'FG-STORE', 'Finished goods store', 'FINISHED_GOODS_STORE', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'SCRAP', 'Scrap yard', 'SCRAP_YARD', CURRENT_TIMESTAMP);
