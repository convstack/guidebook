import { createFileRoute } from "@tanstack/react-router";
import { getRequestUser } from "~/lib/auth";

export const Route = createFileRoute("/api/pages/$slug/revisions/$revisionId")({
	server: {
		handlers: {
			GET: async ({
				request,
				params,
			}: {
				request: Request;
				params: { slug: string; revisionId: string };
			}) => {
				const user = getRequestUser(request);
				if (!user) {
					return new Response(JSON.stringify({ error: "Unauthorized" }), {
						status: 401,
						headers: { "Content-Type": "application/json" },
					});
				}

				const { db } = await import("~/db");
				const { wikiRevision } = await import("~/db/schema");
				const { eq } = await import("drizzle-orm");

				const [revision] = await db
					.select()
					.from(wikiRevision)
					.where(eq(wikiRevision.id, params.revisionId))
					.limit(1);

				if (!revision) {
					return new Response(JSON.stringify({ error: "Revision not found" }), {
						status: 404,
						headers: { "Content-Type": "application/json" },
					});
				}

				return new Response(
					JSON.stringify({
						title: `${revision.title} (revision)`,
						content: revision.content,
						metadata: {
							lastEditedBy: revision.editedBy,
							lastEditedAt: revision.createdAt?.toISOString(),
						},
					}),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					},
				);
			},
		},
	},
});
