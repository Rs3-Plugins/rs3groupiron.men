-- CreateEnum
CREATE TYPE "ItemContainer" AS ENUM ('inventory', 'bank', 'equipment');

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hp_current" INTEGER NOT NULL DEFAULT 0,
    "hp_max" INTEGER NOT NULL DEFAULT 0,
    "prayer_current" INTEGER NOT NULL DEFAULT 0,
    "prayer_max" INTEGER NOT NULL DEFAULT 0,
    "summon_current" INTEGER NOT NULL DEFAULT 0,
    "summon_max" INTEGER NOT NULL DEFAULT 0,
    "world" INTEGER NOT NULL DEFAULT 0,
    "x" INTEGER NOT NULL DEFAULT 0,
    "y" INTEGER NOT NULL DEFAULT 0,
    "plane" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_items" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "container" "ItemContainer" NOT NULL,
    "slot" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "member_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "groups_name_key" ON "groups"("name");

-- CreateIndex
CREATE INDEX "groups_token_idx" ON "groups"("token");

-- CreateIndex
CREATE INDEX "members_group_id_idx" ON "members"("group_id");

-- CreateIndex
CREATE INDEX "members_last_updated_idx" ON "members"("last_updated");

-- CreateIndex
CREATE UNIQUE INDEX "members_group_id_name_key" ON "members"("group_id", "name");

-- CreateIndex
CREATE INDEX "member_items_member_id_container_idx" ON "member_items"("member_id", "container");

-- CreateIndex
CREATE INDEX "member_items_item_id_idx" ON "member_items"("item_id");

-- CreateIndex
CREATE INDEX "member_items_member_id_item_id_idx" ON "member_items"("member_id", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "member_items_member_id_container_slot_key" ON "member_items"("member_id", "container", "slot");

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_items" ADD CONSTRAINT "member_items_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
