import { createFileRoute } from "@tanstack/react-router";
import { getRequestUser } from "~/lib/auth";

export const Route = createFileRoute("/api/pages/$slug/actions")({
	server: {
		handlers: {
			/** @openapi
			 * summary: Get available actions for a page
			 * description: Returns role-aware actions (edit, history, delete).
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
				const user = getRequestUser(request);

				if (!user) {
					return new Response(JSON.stringify({ actions: [] }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					});
				}

				const isStaff = user.role === "staff" || user.role === "admin";
				const isAdmin = user.role === "admin";

				const actions: Array<{
					label: string;
					href?: string;
					danger?: boolean;
					confirm?: boolean;
					redirect?: string;
				}> = [];

				if (isStaff) {
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

				if (isAdmin) {
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
