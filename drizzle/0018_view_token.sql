CREATE TABLE "view_token" (
	"nonce" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "view_token_expires_at_idx" ON "view_token" USING btree ("expires_at");