-- AlterTable
ALTER TABLE "groups" ADD COLUMN "drop_threshold" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "group_rare_items" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "item_id" INTEGER NOT NULL,
    "include" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_rare_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "group_rare_items_group_id_item_id_key" ON "group_rare_items"("group_id", "item_id");

-- CreateIndex
CREATE INDEX "group_rare_items_group_id_idx" ON "group_rare_items"("group_id");

-- AddForeignKey
ALTER TABLE "group_rare_items" ADD CONSTRAINT "group_rare_items_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
