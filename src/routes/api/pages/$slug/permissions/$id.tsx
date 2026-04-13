import { createHandler, httpError } from "@convstack/service-sdk/handlers";
import { createFileRoute } from "@tanstack/react-router";
import { db } from "~/db";
import { wikiPagePermission } from "~/db/schema";
import { checkPageAccess } from "~/lib/page-permissions";

export const Route = createFileRoute("/api/pages/$slug/permissions/$id")({
	server: {
		handlers: {
			/** @openapi
			 * summary: Remove a page permission entry
			 * description: Requires admin access to the target page.
			 * response: 200
			 *   success: boolean
			 * error: 403 Admin access required
			 * error: 404 Not found
			 */
			DELETE: createHandler({
				db,
				handler: async (ctx) => {
					const { slug, id } = ctx.input as { slug: string; id: string };

					const access = await checkPageAccess(ctx.request, slug);
					if (!access.canAdmin) {
						throw httpError.forbidden("Admin access to this page is required");
					}

					const { eq } = await import("drizzle-orm");

					await db
						.delete(wikiPagePermission)
						.where(eq(wikiPagePermission.id, id));

					return { success: true };
				},
			}),
		},
	},
});
