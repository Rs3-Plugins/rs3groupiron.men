-- AlterTable
ALTER TABLE "members" ADD COLUMN     "data_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill from last_updated. Without this every existing member would look
-- like their inventories had just changed, so the first delta poll after deploy
-- would send every bank in full. data_updated_at can never be later than
-- last_updated, so this is also the honest value.
UPDATE "members" SET "data_updated_at" = "last_updated";
