-- CreateTable
CREATE TABLE "member_skills" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "xp" BIGINT NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "base_level" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "member_skills_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "member_skills_member_id_idx" ON "member_skills"("member_id");

-- CreateIndex
CREATE INDEX "member_skills_skill_id_idx" ON "member_skills"("skill_id");

-- CreateIndex
CREATE INDEX "member_skills_xp_idx" ON "member_skills"("xp");

-- CreateIndex
CREATE INDEX "member_skills_member_id_xp_idx" ON "member_skills"("member_id", "xp");

-- CreateIndex
CREATE UNIQUE INDEX "member_skills_member_id_skill_id_key" ON "member_skills"("member_id", "skill_id");

-- AddForeignKey
ALTER TABLE "member_skills" ADD CONSTRAINT "member_skills_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
