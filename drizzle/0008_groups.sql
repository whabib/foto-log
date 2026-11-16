CREATE TABLE "fotolog_group" (
	"did" text PRIMARY KEY NOT NULL,
	"join_policy" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_member" (
	"group_did" text NOT NULL,
	"member_did" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_member_group_did_member_did_pk" PRIMARY KEY("group_did","member_did")
);
--> statement-breakpoint
ALTER TABLE "group_member" ADD CONSTRAINT "group_member_group_did_fotolog_group_did_fk" FOREIGN KEY ("group_did") REFERENCES "public"."fotolog_group"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_member_member_idx" ON "group_member" USING btree ("member_did");