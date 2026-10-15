-- CreateTable
CREATE TABLE "member_achievement_tallies" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "gameval" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "target" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_achievement_tallies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "member_achievement_tallies_member_id_gameval_key" ON "member_achievement_tallies"("member_id", "gameval");

-- CreateIndex
CREATE INDEX "member_achievement_tallies_member_id_idx" ON "member_achievement_tallies"("member_id");

-- AddForeignKey
ALTER TABLE "member_achievement_tallies" ADD CONSTRAINT "member_achievement_tallies_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
