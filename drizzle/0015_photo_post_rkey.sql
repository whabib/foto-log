ALTER TABLE "photo_index" ADD COLUMN "post_rkey" text;--> statement-breakpoint
CREATE INDEX "photo_index_did_post_rkey_idx" ON "photo_index" USING btree ("did","post_rkey");--> statement-breakpoint
-- Back-fill every member again, so their photos already indexed get their post_rkey.
UPDATE "member" SET "backfilled_at" = NULL;