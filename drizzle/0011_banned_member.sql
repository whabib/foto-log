CREATE TABLE "banned_member" (
	"did" text PRIMARY KEY NOT NULL,
	"banned_by" text NOT NULL,
	"banned_at" timestamp with time zone DEFAULT now() NOT NULL
);
