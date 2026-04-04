import { createFileRoute } from "@tanstack/react-router";
import { nanoid } from "nanoid";
import { db } from "~/db";
import { wikiPage } from "~/db/schema";
import { getRequestUser, requireStaff } from "~/lib/auth";
import { uniqueSlug } from "~/lib/slugify";

export const Route = createFileRoute("/api/pages")({
	server: {
		handlers: {
			GET: async () => {
				const { desc } = await import("drizzle-orm");

				const rows = await db
					.select({
						title: wikiPage.title,
						slug: wikiPage.slug,
						updatedBy: wikiPage.updatedBy,
						updatedAt: wikiPage.updatedAt,
					})
					.from(wikiPage)
					.orderBy(desc(wikiPage.updatedAt))
					.limit(200);

				return new Response(
					JSON.stringify({
						columns: [
							{ key: "title", label: "Title" },
							{ key: "updatedBy", label: "Last Editor" },
							{ key: "updatedAt", label: "Updated" },
						],
						rows: rows.map((row) => ({
							title: row.title,
							slug: row.slug,
							updatedBy: row.updatedBy,
							updatedAt: row.updatedAt,
						})),
						total: rows.length,
					}),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					},
				);
			},

			POST: async ({ request }: { request: Request }) => {
				const user = getRequestUser(request);
				if (!user) {
					return new Response(JSON.stringify({ error: "Unauthorized" }), {
						status: 401,
						headers: { "Content-Type": "application/json" },
					});
				}
				const staffError = requireStaff(user);
				if (staffError) return staffError;

				let body: { title?: string; content?: string; parentSlug?: string };
				try {
					body = await request.json();
				} catch {
					return new Response(JSON.stringify({ error: "Invalid JSON" }), {
						status: 400,
						headers: { "Content-Type": "application/json" },
					});
				}

				const { title, content = "", parentSlug } = body;
				if (!title || typeof title !== "string" || title.trim() === "") {
					return new Response(JSON.stringify({ error: "Title is required" }), {
						status: 400,
						headers: { "Content-Type": "application/json" },
					});
				}

				const slug = await uniqueSlug(title.trim());
				const id = nanoid();
				const now = new Date();

				await db.insert(wikiPage).values({
					id,
					title: title.trim(),
					slug,
					content,
					parentSlug: parentSlug || null,
					createdBy: user.id,
					updatedBy: user.id,
					createdAt: now,
					updatedAt: now,
				});

				return new Response(
					JSON.stringify({
						success: true,
						redirect: `/guidebook/pages/${slug}`,
					}),
					{
						status: 201,
						headers: { "Content-Type": "application/json" },
					},
				);
			},
		},
	},
});
