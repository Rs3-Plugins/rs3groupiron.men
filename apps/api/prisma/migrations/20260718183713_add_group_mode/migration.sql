-- CreateEnum
CREATE TYPE "GroupMode" AS ENUM ('normal', 'competitive');

-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "mode" "GroupMode" NOT NULL DEFAULT 'normal';
