-- CreateEnum
CREATE TYPE "GroupVisibility" AS ENUM ('private', 'public');

-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "visibility" "GroupVisibility" NOT NULL DEFAULT 'private',
ADD COLUMN     "public_map" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "public_skills" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "public_items" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "public_quests" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "public_achievements" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "groups_visibility_name_key_idx" ON "groups"("visibility", "name_key");
