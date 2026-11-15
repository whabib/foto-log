CREATE TABLE "member" (
	"did" text PRIMARY KEY NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
