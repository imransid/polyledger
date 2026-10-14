-- Item codes never change once created, so balances keep a copy and can sort
-- and search by code. Existing rows take theirs from the item they hold.
ALTER TABLE "stock_balances" ADD COLUMN "item_code" TEXT;

UPDATE "stock_balances" b
SET "item_code" = m."code"
FROM "raw_materials" m
WHERE b."item_type" = 'RAW_MATERIAL' AND m."id" = b."item_id";

UPDATE "stock_balances" b
SET "item_code" = p."code"
FROM "products" p
WHERE b."item_type" = 'PRODUCT' AND p."id" = b."item_id";

ALTER TABLE "stock_balances" ALTER COLUMN "item_code" SET NOT NULL;

-- CreateIndex
CREATE INDEX "stock_balances_item_type_item_code_idx" ON "stock_balances"("item_type", "item_code");
