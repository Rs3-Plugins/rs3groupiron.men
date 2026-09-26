-- Items move into inventories keyed by the RS3 inv gameval (inv / worn /
-- bank / ...). Members own theirs in member_inventories; the group owns the
-- shared bank in group_inventories, replacing the "@SHARED" pseudo-member.
-- Existing rows are migrated: inventory -> inv, equipment -> worn, bank -> bank.

-- CreateTable
CREATE TABLE "member_inventories" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_inventories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_inventory_items" (
    "id" TEXT NOT NULL,
    "inventory_id" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "member_inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_inventories" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_inventories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_inventory_items" (
    "id" TEXT NOT NULL,
    "inventory_id" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "group_inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "member_inventories_member_id_key_key" ON "member_inventories"("member_id", "key");
CREATE UNIQUE INDEX "member_inventory_items_inventory_id_slot_key" ON "member_inventory_items"("inventory_id", "slot");
CREATE UNIQUE INDEX "group_inventories_group_id_key_key" ON "group_inventories"("group_id", "key");
CREATE UNIQUE INDEX "group_inventory_items_inventory_id_slot_key" ON "group_inventory_items"("inventory_id", "slot");

-- AddForeignKey
ALTER TABLE "member_inventories" ADD CONSTRAINT "member_inventories_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member_inventory_items" ADD CONSTRAINT "member_inventory_items_inventory_id_fkey" FOREIGN KEY ("inventory_id") REFERENCES "member_inventories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_inventories" ADD CONSTRAINT "group_inventories_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_inventory_items" ADD CONSTRAINT "group_inventory_items_inventory_id_fkey" FOREIGN KEY ("inventory_id") REFERENCES "group_inventories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Member-owned items: one inventory per (member, old enum value) with rows.
INSERT INTO "member_inventories" ("id", "member_id", "key")
SELECT gen_random_uuid()::text,
       s."member_id",
       CASE s."container"
         WHEN 'inventory' THEN 'inv'
         WHEN 'equipment' THEN 'worn'
         ELSE 'bank'
       END
FROM (
  SELECT DISTINCT i."member_id", i."container"
  FROM "member_items" i
  JOIN "members" m ON m."id" = i."member_id"
  WHERE m."name" <> '@SHARED'
) s;

INSERT INTO "member_inventory_items" ("id", "inventory_id", "slot", "item_id", "quantity")
SELECT i."id", inv."id", i."slot", i."item_id", i."quantity"
FROM "member_items" i
JOIN "members" m ON m."id" = i."member_id"
JOIN "member_inventories" inv
  ON inv."member_id" = i."member_id"
 AND inv."key" = CASE i."container"
                   WHEN 'inventory' THEN 'inv'
                   WHEN 'equipment' THEN 'worn'
                   ELSE 'bank'
                 END
WHERE m."name" <> '@SHARED';

-- The "@SHARED" pseudo-member's bank becomes the group's bank inventory.
INSERT INTO "group_inventories" ("id", "group_id", "key", "updated_at")
SELECT gen_random_uuid()::text, m."group_id", 'bank', m."last_updated"
FROM "members" m
WHERE m."name" = '@SHARED'
  AND EXISTS (
    SELECT 1 FROM "member_items" i
    WHERE i."member_id" = m."id" AND i."container" = 'bank'
  );

INSERT INTO "group_inventory_items" ("id", "inventory_id", "slot", "item_id", "quantity")
SELECT i."id", g."id", i."slot", i."item_id", i."quantity"
FROM "member_items" i
JOIN "members" m ON m."id" = i."member_id"
JOIN "group_inventories" g ON g."group_id" = m."group_id" AND g."key" = 'bank'
WHERE m."name" = '@SHARED' AND i."container" = 'bank';

-- Drop the old shape and the pseudo-member rows.
DROP TABLE "member_items";
DROP TYPE "ItemContainer";
DELETE FROM "members" WHERE "name" = '@SHARED';
