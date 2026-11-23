CREATE TABLE "photo_view" (
	"member_did" text NOT NULL,
	"photo_rkey" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"impressions" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "photo_view_member_did_photo_rkey_created_at_pk" PRIMARY KEY("member_did","photo_rkey","created_at")
);
--> statement-breakpoint
CREATE TABLE "view_token" (
	"nonce" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "photo_view" ADD CONSTRAINT "photo_view_photo_fk" FOREIGN KEY ("member_did","photo_rkey") REFERENCES "public"."photo_index"("did","rkey") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "photo_view_created_at_idx" ON "photo_view" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "photo_view_member_created_at_idx" ON "photo_view" USING btree ("member_did","created_at");--> statement-breakpoint
CREATE INDEX "view_token_expires_at_idx" ON "view_token" USING btree ("expires_at");