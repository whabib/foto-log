ALTER TABLE "member" ADD COLUMN "handle" text;--> statement-breakpoint
-- Backfill everyone again so it records their handles.
UPDATE "member" SET "backfilled_at" = NULL;
