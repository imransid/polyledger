-- AlterTable
ALTER TABLE "job_cards" ADD COLUMN     "closed_at" TIMESTAMPTZ(3);

-- Nothing changes a card after it closes, so its last update is when it closed.
UPDATE "job_cards" SET "closed_at" = "updated_at" WHERE "status" = 'CLOSED';
