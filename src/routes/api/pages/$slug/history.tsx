import { createFileRoute } from "@tanstack/react-router";
import { getRequestUser } from "~/lib/auth";
import { resolveUserNames } from "~/lib/users";

export const Route = createFileRoute("/api/pages/$slug/history")({
	server: {
		handlers: {
			/** @openapi
			 * summary: Get revision history for a page
			 * auth: user
			 * response: 200
			 *   columns: array
			 *   rows: array
			 *   total: integer
			 * error: 401 Unauthorized
			 * error: 404 Page not found
			 */
			GET: async ({
				request,
				params,
			}: {
				request: Request;
				params: { slug: string };
			}) => {
				const user = getRequestUser(request);
				if (!user) {
					return new Response(JSON.stringify({ error: "Unauthorized" }), {
						status: 401,
						headers: { "Content-Type": "application/json" },
					});
				}

				const { db } = await import("~/db");
				const { wikiPage, wikiRevision } = await import("~/db/schema");
				const { eq, desc } = await import("drizzle-orm");

				const [page] = await db
					.select({ id: wikiPage.id, title: wikiPage.title })
					.from(wikiPage)
					.where(eq(wikiPage.slug, params.slug))
					.limit(1);

				if (!page) {
					return new Response(JSON.stringify({ error: "Page not found" }), {
						status: 404,
						headers: { "Content-Type": "application/json" },
					});
				}

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

				// Resolve user IDs to display names
				const userIds = revisions.map((r) => r.editedBy);
				const nameMap = await resolveUserNames(userIds);

				return new Response(
					JSON.stringify({
						columns: [
							{ key: "title", label: "Title" },
							{ key: "editedBy", label: "Editor" },
							{ key: "editSummary", label: "Summary" },
							{ key: "createdAt", label: "Date" },
						],
						rows: revisions.map((r) => ({
							...r,
							editedBy: nameMap.get(r.editedBy) || r.editedBy,
							editSummary: r.editSummary || "—",
							createdAt: r.createdAt
								? new Date(r.createdAt).toLocaleString()
								: "",
						})),
						total: revisions.length,
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				);
			},
		},
	},
});
