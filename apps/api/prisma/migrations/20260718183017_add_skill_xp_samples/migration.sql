-- CreateTable
CREATE TABLE "skill_xp_samples" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "xp" BIGINT NOT NULL,
    "sampled_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_xp_samples_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "skill_xp_samples_member_id_skill_id_sampled_at_idx" ON "skill_xp_samples"("member_id", "skill_id", "sampled_at");

-- CreateIndex
CREATE INDEX "skill_xp_samples_member_id_sampled_at_idx" ON "skill_xp_samples"("member_id", "sampled_at");

-- CreateIndex
CREATE INDEX "skill_xp_samples_sampled_at_idx" ON "skill_xp_samples"("sampled_at");

-- AddForeignKey
ALTER TABLE "skill_xp_samples" ADD CONSTRAINT "skill_xp_samples_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
