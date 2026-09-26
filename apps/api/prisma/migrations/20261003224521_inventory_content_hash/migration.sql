-- AlterTable
ALTER TABLE "group_inventories" ADD COLUMN     "content_hash" TEXT;

-- AlterTable
ALTER TABLE "member_inventories" ADD COLUMN     "content_hash" TEXT;
