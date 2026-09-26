-- CreateTable
CREATE TABLE "shared_bank_entries" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "member_name" TEXT NOT NULL,
    "item_id" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shared_bank_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shared_bank_entries_group_id_created_at_idx" ON "shared_bank_entries"("group_id", "created_at");

-- AddForeignKey
ALTER TABLE "shared_bank_entries" ADD CONSTRAINT "shared_bank_entries_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
