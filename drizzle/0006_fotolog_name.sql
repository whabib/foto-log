ALTER TABLE "member" ADD COLUMN "fotolog_name" text;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "show_fotolog_name" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_fotolog_name_unique" UNIQUE("fotolog_name");