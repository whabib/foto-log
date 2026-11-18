CREATE TABLE "closed_member" (
	"did" text PRIMARY KEY NOT NULL,
	"fotolog_name" text,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "closed_member_name_idx" ON "closed_member" USING btree ("fotolog_name");