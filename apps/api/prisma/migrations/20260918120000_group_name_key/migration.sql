-- Add normalised (lower-cased) group name for case-insensitive unique lookups.
ALTER TABLE "groups" ADD COLUMN "name_key" TEXT;

UPDATE "groups" SET "name_key" = lower("name");

ALTER TABLE "groups" ALTER COLUMN "name_key" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "groups_name_key_key" ON "groups"("name_key");
