-- CreateEnum
CREATE TYPE "QuestState" AS ENUM ('started', 'finished');

-- CreateTable
CREATE TABLE "member_quests" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "gameval" TEXT NOT NULL,
    "state" "QuestState" NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_quests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "member_quests_member_id_gameval_key" ON "member_quests"("member_id", "gameval");

-- AddForeignKey
ALTER TABLE "member_quests" ADD CONSTRAINT "member_quests_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
