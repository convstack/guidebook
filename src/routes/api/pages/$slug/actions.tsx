import { createFileRoute } from "@tanstack/react-router";
import { checkPageAccess } from "~/lib/page-permissions";

export const Route = createFileRoute("/api/pages/$slug/actions")({
	server: {
		handlers: {
			/** @openapi
			 * summary: Get available actions for a page
			 * description: Returns permission-aware actions (edit, history, delete, permissions).
			 * response: 200
			 *   actions: array
			 */
			GET: async ({
				request,
				params,
			}: {
				request: Request;
				params: { slug: string };
			}) => {
				const access = await checkPageAccess(request, params.slug);

				const actions: Array<{
					label: string;
					href?: string;
					danger?: boolean;
					confirm?: boolean;
					redirect?: string;
				}> = [];

				if (access.canWrite) {
					actions.push(
						{
							label: "Edit",
							href: `/pages/${params.slug}/edit`,
						},
						{
							label: "History",
							href: `/pages/${params.slug}/history`,
						},
					);
				}

				if (access.canAdmin) {
					actions.push({
						label: "Permissions",
						href: `/pages/${params.slug}/permissions`,
					});
					actions.push({
						label: "Delete",
						danger: true,
						confirm: true,
						redirect: "/",
					});
				}

				return new Response(JSON.stringify({ actions }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			},
		},
	},
});
