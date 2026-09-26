-- AlterTable
ALTER TABLE "members" ADD COLUMN     "color" TEXT,
ADD COLUMN     "use_discord_avatar" BOOLEAN NOT NULL DEFAULT true;
