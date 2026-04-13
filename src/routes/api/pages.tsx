import { createHandler, httpError } from "@convstack/service-sdk/handlers";
import { createFileRoute } from "@tanstack/react-router";
import { nanoid } from "nanoid";
import { db } from "~/db";
import { wikiPage } from "~/db/schema";
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
			GET: createHandler({
				db,
				handler: async (ctx) => {
					const { desc } = await import("drizzle-orm");

					// Get the set of page IDs this user can access (null = no filtering needed)
					const accessibleIds = await getAccessiblePageIds(ctx.request);

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

					return {
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
					};
				},
			}),

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
			POST: createHandler({
				db,
				handler: async (ctx) => {
					if (!ctx.permissions.includes("guidebook:pages:write")) {
						if (!ctx.user) throw httpError.unauthorized();
						throw httpError.forbidden(
							'The "guidebook:pages:write" permission is required.',
						);
					}

					if (!ctx.user) throw httpError.unauthorized();

					const {
						title,
						content = "",
						parentSlug,
					} = ctx.input as {
						title?: string;
						content?: string;
						parentSlug?: string;
					};

					if (!title || typeof title !== "string" || title.trim() === "") {
						throw httpError.badRequest("Title is required");
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
						createdBy: ctx.user.id,
						updatedBy: ctx.user.id,
						createdAt: now,
						updatedAt: now,
					});

					return {
						success: true,
						redirect: `/guidebook/pages/${slug}`,
					};
				},
			}),
		},
	},
});
