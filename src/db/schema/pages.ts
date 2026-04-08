import {
	boolean,
	integer,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

export const wikiPage = pgTable("wiki_page", {
	id: text("id").primaryKey(),
	title: text("title").notNull(),
	slug: text("slug").notNull().unique(),
	content: text("content").notNull().default(""),
	parentSlug: text("parent_slug"),
	departmentId: text("department_id"),
	createdBy: text("created_by").notNull(),
	updatedBy: text("updated_by").notNull(),
	published: boolean("published").notNull().default(true),
	sortOrder: integer("sort_order").notNull().default(0),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Per-page access control. If a page has entries here, only members
 * of the listed departments can access it. If no entries exist,
 * the page inherits permissions from its parent page (via parentSlug).
 * If no page in the chain has entries, the page is accessible to
 * anyone with the service-level guidebook:pages:read permission.
 *
 * access: "read" = view only, "write" = view + edit
 */
export const wikiPagePermission = pgTable("wiki_page_permission", {
	id: text("id").primaryKey(),
	pageId: text("page_id")
		.notNull()
		.references(() => wikiPage.id, { onDelete: "cascade" }),
	departmentId: text("department_id").notNull(),
	access: text("access").notNull().default("read"), // "read" | "write"
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const wikiRevision = pgTable("wiki_revision", {
	id: text("id").primaryKey(),
	pageId: text("page_id")
		.notNull()
		.references(() => wikiPage.id, { onDelete: "cascade" }),
	title: text("title").notNull(),
	content: text("content").notNull(),
	editedBy: text("edited_by").notNull(),
	editSummary: text("edit_summary"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});
