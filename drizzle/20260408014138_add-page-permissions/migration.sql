CREATE TABLE "wiki_page_permission" (
	"id" text PRIMARY KEY,
	"page_id" text NOT NULL,
	"department_id" text NOT NULL,
	"access" text DEFAULT 'read' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wiki_page_permission" ADD CONSTRAINT "wiki_page_permission_page_id_wiki_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "wiki_page"("id") ON DELETE CASCADE;