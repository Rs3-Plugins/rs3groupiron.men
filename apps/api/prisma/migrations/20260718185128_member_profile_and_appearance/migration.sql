-- CreateEnum
CREATE TYPE "AppearanceTheme" AS ENUM ('rs3', 'modern');

-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "appearance" "AppearanceTheme" NOT NULL DEFAULT 'rs3';

-- AlterTable
ALTER TABLE "members" ADD COLUMN     "discord_id" TEXT,
ADD COLUMN     "nickname" TEXT;
