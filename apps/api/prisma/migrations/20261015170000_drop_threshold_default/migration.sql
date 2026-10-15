-- AlterTable
ALTER TABLE "groups" ALTER COLUMN "drop_threshold" SET DEFAULT 20000000;

-- Groups created before the default existed are all sitting at 0, which means
-- "announce nothing unlisted". Bring them to the same default rather than
-- leaving the feature off for everyone who already had a group.
UPDATE "groups" SET "drop_threshold" = 20000000 WHERE "drop_threshold" = 0;
