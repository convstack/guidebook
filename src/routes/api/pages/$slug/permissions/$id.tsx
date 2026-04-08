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
			DELETE: async ({
				request,
				params,
			}: {
				request: Request;
				params: { slug: string; id: string };
			}) => {
				const access = await checkPageAccess(request, params.slug);
				if (!access.canAdmin) {
					return new Response(
						JSON.stringify({
							error: "Admin access to this page is required",
						}),
						{
							status: 403,
							headers: { "Content-Type": "application/json" },
						},
					);
				}

				const { eq } = await import("drizzle-orm");

				await db
					.delete(wikiPagePermission)
					.where(eq(wikiPagePermission.id, params.id));

				return new Response(JSON.stringify({ success: true }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			},
		},
	},
});
