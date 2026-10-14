-- CreateEnum
CREATE TYPE "GatePassStatus" AS ENUM ('PENDING', 'PASSED');

-- CreateEnum
CREATE TYPE "ReturnReason" AS ENUM ('DAMAGED', 'WRONG_ITEM', 'QUALITY');

-- CreateEnum
CREATE TYPE "ReturnSettlement" AS ENUM ('REPLACE', 'CREDIT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockDocumentKind" ADD VALUE 'DISPATCH';
ALTER TYPE "StockDocumentKind" ADD VALUE 'CUSTOMER_RETURN';

-- AlterTable
ALTER TABLE "sales_order_lines" ADD COLUMN     "delivered_pieces" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "returned_pieces" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sales_orders" ADD COLUMN     "over_delivery_basis_points" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "short_close_reason" TEXT;

-- CreateTable
CREATE TABLE "delivery_challans" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "stock_document_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "from_location_id" UUID NOT NULL,
    "vehicle_number" TEXT NOT NULL,
    "driver_name" TEXT NOT NULL,
    "driver_phone" TEXT NOT NULL,
    "delivery_address" TEXT NOT NULL,
    "notes" TEXT,
    "dispatched_on" DATE NOT NULL,
    "gate_pass_status" "GatePassStatus" NOT NULL DEFAULT 'PENDING',
    "gate_passed_at" TIMESTAMPTZ(3),
    "gate_passed_by_id" UUID,
    "reversed_at" TIMESTAMPTZ(3),
    "recorded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_challans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_challan_lines" (
    "challan_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "pieces" INTEGER NOT NULL,
    "returned_pieces" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "delivery_challan_lines_pkey" PRIMARY KEY ("challan_id","product_id")
);

-- CreateTable
CREATE TABLE "customer_returns" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "stock_document_id" UUID NOT NULL,
    "challan_id" UUID NOT NULL,
    "to_location_id" UUID NOT NULL,
    "reason" "ReturnReason" NOT NULL,
    "settlement" "ReturnSettlement" NOT NULL,
    "returned_on" DATE NOT NULL,
    "reversed_at" TIMESTAMPTZ(3),
    "recorded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_return_lines" (
    "return_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "pieces" INTEGER NOT NULL,

    CONSTRAINT "customer_return_lines_pkey" PRIMARY KEY ("return_id","product_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_challans_number_key" ON "delivery_challans"("number");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_challans_stock_document_id_key" ON "delivery_challans"("stock_document_id");

-- CreateIndex
CREATE INDEX "delivery_challans_order_id_idx" ON "delivery_challans"("order_id");

-- CreateIndex
CREATE INDEX "delivery_challans_customer_id_dispatched_on_idx" ON "delivery_challans"("customer_id", "dispatched_on");

-- CreateIndex
CREATE INDEX "delivery_challans_gate_pass_status_idx" ON "delivery_challans"("gate_pass_status");

-- CreateIndex
CREATE UNIQUE INDEX "customer_returns_number_key" ON "customer_returns"("number");

-- CreateIndex
CREATE UNIQUE INDEX "customer_returns_stock_document_id_key" ON "customer_returns"("stock_document_id");

-- CreateIndex
CREATE INDEX "customer_returns_challan_id_idx" ON "customer_returns"("challan_id");

-- AddForeignKey
ALTER TABLE "delivery_challans" ADD CONSTRAINT "delivery_challans_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_challans" ADD CONSTRAINT "delivery_challans_gate_passed_by_id_fkey" FOREIGN KEY ("gate_passed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_challan_lines" ADD CONSTRAINT "delivery_challan_lines_challan_id_fkey" FOREIGN KEY ("challan_id") REFERENCES "delivery_challans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_returns" ADD CONSTRAINT "customer_returns_challan_id_fkey" FOREIGN KEY ("challan_id") REFERENCES "delivery_challans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_returns" ADD CONSTRAINT "customer_returns_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_return_lines" ADD CONSTRAINT "customer_return_lines_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "customer_returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_over_delivery" CHECK ("over_delivery_basis_points" BETWEEN 0 AND 10000);
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_deliveries" CHECK ("delivered_pieces" >= 0 AND "returned_pieces" >= 0);

ALTER TABLE "delivery_challan_lines" ADD CONSTRAINT "delivery_challan_lines_pieces" CHECK ("pieces" > 0 AND "returned_pieces" BETWEEN 0 AND "pieces");
ALTER TABLE "customer_return_lines" ADD CONSTRAINT "customer_return_lines_pieces" CHECK ("pieces" > 0);

-- Passed means when and by whom; a challan that left the gate is never reversed.
ALTER TABLE "delivery_challans" ADD CONSTRAINT "delivery_challans_gate_pass" CHECK (
  ("gate_pass_status" = 'PENDING' AND "gate_passed_at" IS NULL AND "gate_passed_by_id" IS NULL)
  OR ("gate_pass_status" = 'PASSED' AND "gate_passed_at" IS NOT NULL AND "gate_passed_by_id" IS NOT NULL AND "reversed_at" IS NULL)
);

-- DC-000001 and CRN-000001.
CREATE SEQUENCE "stock_document_number_dispatch";
CREATE SEQUENCE "stock_document_number_customer_return";
