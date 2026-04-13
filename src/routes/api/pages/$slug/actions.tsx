import { createHandler } from "@convstack/service-sdk/handlers";
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
			GET: createHandler({
				handler: async (ctx) => {
					const slug = ctx.input.slug as string;
					const access = await checkPageAccess(ctx.request, slug);

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
								href: `/pages/${slug}/edit`,
							},
							{
								label: "History",
								href: `/pages/${slug}/history`,
							},
						);
					}

					if (access.canAdmin) {
						actions.push({
							label: "Permissions",
							href: `/pages/${slug}/permissions`,
						});
						actions.push({
							label: "Delete",
							danger: true,
							confirm: true,
							redirect: "/",
						});
					}

					return { actions };
				},
			}),
		},
	},
});
