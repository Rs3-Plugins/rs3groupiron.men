-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "views_total" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "group_view_days" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "group_view_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "group_view_days_group_id_day_key" ON "group_view_days"("group_id", "day");

-- CreateIndex
CREATE INDEX "group_view_days_day_idx" ON "group_view_days"("day");

-- AddForeignKey
ALTER TABLE "group_view_days" ADD CONSTRAINT "group_view_days_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
