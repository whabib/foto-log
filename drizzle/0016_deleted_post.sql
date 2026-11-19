CREATE TABLE "deleted_post" (
	"did" text NOT NULL,
	"rkey" text NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deleted_post_did_rkey_pk" PRIMARY KEY("did","rkey")
);
--> statement-breakpoint
DELETE FROM "app_state" WHERE "key" = 'jetstream_post_cursor';