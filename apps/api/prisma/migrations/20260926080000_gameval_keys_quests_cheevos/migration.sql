-- Stable RS3 gameval name (e.g. quest_cooks_assistant) for quest/diary
-- achievements. Names survive cache renumbering where ids do not.
ALTER TABLE "achievements" ADD COLUMN "gameval" TEXT;
