-- Drop indexes that no query uses (token is compared in application code;
-- item_id / last_updated / skill xp are never filtered or sorted on).

-- DropIndex
DROP INDEX IF EXISTS "groups_token_idx";

-- DropIndex
DROP INDEX IF EXISTS "members_last_updated_idx";

-- DropIndex
DROP INDEX IF EXISTS "member_items_item_id_idx";

-- DropIndex
DROP INDEX IF EXISTS "member_items_member_id_item_id_idx";

-- DropIndex
DROP INDEX IF EXISTS "member_skills_skill_id_idx";

-- DropIndex
DROP INDEX IF EXISTS "member_skills_xp_idx";

-- DropIndex
DROP INDEX IF EXISTS "member_skills_member_id_xp_idx";
