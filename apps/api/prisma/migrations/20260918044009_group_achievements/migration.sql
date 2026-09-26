-- CreateEnum
CREATE TYPE "AchievementKind" AS ENUM ('level', 'drop', 'quest', 'diary', 'other');

-- CreateTable
CREATE TABLE "achievements" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "member_name" TEXT NOT NULL,
    "kind" "AchievementKind" NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "skill_id" TEXT,
    "item_id" INTEGER,
    "image_url" TEXT,
    "dedupe_key" TEXT,
    "achieved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "achievements_group_id_achieved_at_idx" ON "achievements"("group_id", "achieved_at");

-- CreateIndex
CREATE UNIQUE INDEX "achievements_group_id_dedupe_key_key" ON "achievements"("group_id", "dedupe_key");

-- AddForeignKey
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
