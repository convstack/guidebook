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
