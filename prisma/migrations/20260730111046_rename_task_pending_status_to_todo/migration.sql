-- AlterTable
ALTER TABLE "schedule_task" ALTER COLUMN "status" SET DEFAULT 'to_do';

-- AlterTable
ALTER TABLE "task" ALTER COLUMN "status" SET DEFAULT 'to_do';

-- DataMigration: rename the existing "pending" status value to "to_do" on
-- both tables, in place. Row counts are unaffected -- only the status string
-- on already-matching rows changes; every other column is untouched.
UPDATE "task" SET "status" = 'to_do' WHERE "status" = 'pending';
UPDATE "schedule_task" SET "status" = 'to_do' WHERE "status" = 'pending';

