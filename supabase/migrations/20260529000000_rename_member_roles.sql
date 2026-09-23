-- Rename MemberRole enum values to match the new taxonomy

ALTER TYPE "MemberRole" RENAME VALUE 'OWNER' TO 'SYSTEM_ADMIN';
ALTER TYPE "MemberRole" RENAME VALUE 'ADMIN' TO 'ACCOUNT_ADMIN';
ALTER TYPE "MemberRole" RENAME VALUE 'MEMBER' TO 'EDITOR';
-- VIEWER remains VIEWER
