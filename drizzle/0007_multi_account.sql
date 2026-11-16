ALTER TABLE "user_session" ADD COLUMN "browser_id" text;--> statement-breakpoint
ALTER TABLE "user_session" ADD COLUMN "last_active_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "user_session_browser_idx" ON "user_session" USING btree ("browser_id");