CREATE TABLE "wiki_page" (
	"id" text PRIMARY KEY,
	"title" text NOT NULL,
	"slug" text NOT NULL UNIQUE,
	"content" text DEFAULT '' NOT NULL,
	"parent_slug" text,
	"department_id" text,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wiki_revision" (
	"id" text PRIMARY KEY,
	"page_id" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"edited_by" text NOT NULL,
	"edit_summary" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wiki_revision" ADD CONSTRAINT "wiki_revision_page_id_wiki_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "wiki_page"("id") ON DELETE CASCADE;