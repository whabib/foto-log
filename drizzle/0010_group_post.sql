CREATE TABLE "group_post" (
	"group_did" text NOT NULL,
	"rkey" text NOT NULL,
	"member_did" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_post_group_did_rkey_pk" PRIMARY KEY("group_did","rkey")
);
