import { createHandler, httpError } from "@convstack/service-sdk/handlers";
import { createFileRoute } from "@tanstack/react-router";
import { resolveUserNames } from "~/lib/users";

export const Route = createFileRoute("/api/pages/$slug/history")({
	server: {
		handlers: {
			/** @openapi
			 * summary: Get revision history for a page as a timeline
			 * auth: user
			 * response: 200
			 *   events: array
			 *   topBar: object
			 * error: 401 Unauthorized
			 * error: 404 Page not found
			 */
			GET: createHandler({
				handler: async (ctx) => {
					if (!ctx.user) throw httpError.unauthorized();

					const { db } = await import("~/db");
					const { wikiPage, wikiRevision } = await import("~/db/schema");
					const { eq, desc } = await import("drizzle-orm");
					const slug = (ctx.input as { slug: string }).slug;

					const [page] = await db
						.select({ id: wikiPage.id, title: wikiPage.title })
						.from(wikiPage)
						.where(eq(wikiPage.slug, slug))
						.limit(1);

					if (!page) throw httpError.notFound("Page not found");

					const revisions = await db
						.select({
							id: wikiRevision.id,
							title: wikiRevision.title,
							editedBy: wikiRevision.editedBy,
							editSummary: wikiRevision.editSummary,
							createdAt: wikiRevision.createdAt,
						})
						.from(wikiRevision)
						.where(eq(wikiRevision.pageId, page.id))
						.orderBy(desc(wikiRevision.createdAt))
						.limit(100);

					const userIds = revisions.map((r) => r.editedBy);
					const nameMap = await resolveUserNames(userIds);

					const events = revisions.map((r) => ({
						id: r.id,
						timestamp: r.createdAt
							? new Date(r.createdAt).toISOString()
							: new Date().toISOString(),
						actor: {
							name: nameMap.get(r.editedBy) || r.editedBy,
						},
						action: "edited",
						description: r.editSummary || undefined,
						link: `/pages/${slug}/revisions/${r.id}`,
					}));

					const topBar = {
						breadcrumbs: [
							{ label: page.title, href: `/pages/${slug}` },
							{ label: "History" },
						],
					};

					return { events, topBar };
				},
			}),
		},
	},
});
