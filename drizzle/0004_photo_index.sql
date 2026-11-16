CREATE TABLE "app_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photo_index" (
	"did" text NOT NULL,
	"rkey" text NOT NULL,
	"cid" text NOT NULL,
	"image_cid" text NOT NULL,
	"alt" text,
	"caption" text,
	"upload_date" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "photo_index_did_rkey_pk" PRIMARY KEY("did","rkey")
);
--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "backfilled_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "photo_index_created_at_idx" ON "photo_index" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "photo_index_did_created_at_idx" ON "photo_index" USING btree ("did","created_at");