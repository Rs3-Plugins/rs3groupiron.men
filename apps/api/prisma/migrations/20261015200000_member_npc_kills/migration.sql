-- AlterTable
ALTER TABLE "members" ADD COLUMN "npc_kills_total" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "member_npc_kills" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "npc_name" TEXT NOT NULL,
    "kills" INTEGER NOT NULL DEFAULT 0,
    "last_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_npc_kills_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "member_npc_kills_member_id_npc_name_key" ON "member_npc_kills"("member_id", "npc_name");

-- CreateIndex
CREATE INDEX "member_npc_kills_member_id_idx" ON "member_npc_kills"("member_id");

-- AddForeignKey
ALTER TABLE "member_npc_kills" ADD CONSTRAINT "member_npc_kills_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
