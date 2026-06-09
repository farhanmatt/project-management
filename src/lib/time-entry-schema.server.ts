import { db } from "@/lib/db";

let timeEntrySchemaReady = false;

export async function ensureTimeEntrySchemaReady() {
  if (timeEntrySchemaReady) {
    return;
  }

  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`
      DO $$
      BEGIN
        PERFORM pg_advisory_xact_lock(1349824);
      END $$;
    `);
    await tx.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TimeEntryStatus') THEN
          CREATE TYPE "TimeEntryStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED');
        END IF;
      END $$;
    `);
    await tx.$executeRawUnsafe(`ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "taskId" TEXT`);
    await tx.$executeRawUnsafe(`ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "taskTitle" TEXT`);
    await tx.$executeRawUnsafe(`
      ALTER TABLE "time_entries"
      ADD COLUMN IF NOT EXISTS "status" "TimeEntryStatus" NOT NULL DEFAULT 'DRAFT'
    `);
    await tx.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "time_entries_taskId_date_idx"
      ON "time_entries"("taskId", "date")
    `);
  });

  timeEntrySchemaReady = true;
}
