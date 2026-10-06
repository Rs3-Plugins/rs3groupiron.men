-- CreateTable
CREATE TABLE "member_achievements" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "gameval" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_achievements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "member_achievements_member_id_gameval_key" ON "member_achievements"("member_id", "gameval");

-- AddForeignKey
ALTER TABLE "member_achievements" ADD CONSTRAINT "member_achievements_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
