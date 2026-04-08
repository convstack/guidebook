import { createFileRoute } from "@tanstack/react-router";
import { nanoid } from "nanoid";
import { db } from "~/db";
import { wikiPage } from "~/db/schema";
import { getRequestUser, requirePermission } from "~/lib/auth";
import { getAccessiblePageIds } from "~/lib/page-permissions";
import { uniqueSlug } from "~/lib/slugify";
import { resolveUserNames } from "~/lib/users";

export const Route = createFileRoute("/api/pages")({
	server: {
		handlers: {
			/** @openapi
			 * summary: List all wiki pages
			 * response: 200
			 *   columns: array
			 *   rows: array
			 *   total: integer
			 */
			GET: async ({ request }: { request: Request }) => {
				const { desc } = await import("drizzle-orm");

				// Get the set of page IDs this user can access (null = no filtering needed)
				const accessibleIds = await getAccessiblePageIds(request);

				const rows = await db
					.select({
						id: wikiPage.id,
						title: wikiPage.title,
						slug: wikiPage.slug,
						updatedBy: wikiPage.updatedBy,
						updatedAt: wikiPage.updatedAt,
					})
					.from(wikiPage)
					.orderBy(desc(wikiPage.updatedAt))
					.limit(200);

				const filtered = accessibleIds
					? rows.filter((row) => accessibleIds.has(row.id))
					: rows;

				const userIds = filtered.map((r) => r.updatedBy);
				const nameMap = await resolveUserNames(userIds);

				return new Response(
					JSON.stringify({
						columns: [
							{ key: "title", label: "Title" },
							{ key: "updatedBy", label: "Last Editor" },
							{ key: "updatedAt", label: "Updated" },
						],
						rows: filtered.map((row) => ({
							title: row.title,
							slug: row.slug,
							updatedBy: nameMap.get(row.updatedBy) || row.updatedBy,
							updatedAt: row.updatedAt,
						})),
						total: filtered.length,
					}),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					},
				);
			},

			/** @openapi
			 * summary: Create a new wiki page
			 * auth: staff
			 * body:
			 *   title: string (required) - Page title
			 *   content: string - Markdown content
			 *   parentSlug: string - Parent page slug for hierarchy
			 * response: 201
			 *   success: boolean
			 *   redirect: string
			 * error: 400 Validation error
			 * error: 401 Unauthorized
			 * error: 403 Staff access required
			 */
			POST: async ({ request }: { request: Request }) => {
				const permErr = requirePermission(request, "guidebook:pages:write");
				if (permErr) return permErr;

				const user = getRequestUser(request);
				if (!user) {
					return new Response(JSON.stringify({ error: "Unauthorized" }), {
						status: 401,
						headers: { "Content-Type": "application/json" },
					});
				}

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
