CREATE TABLE "group_post_claim" (
	"group_did" text NOT NULL,
	"upload_date" text NOT NULL,
	"member_did" text NOT NULL,
	"sequence" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_post_claim_group_did_upload_date_member_did_pk" PRIMARY KEY("group_did","upload_date","member_did"),
	CONSTRAINT "group_post_claim_sequence" UNIQUE("group_did","upload_date","sequence")
);
