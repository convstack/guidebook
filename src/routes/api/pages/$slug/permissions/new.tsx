import { createHandler, httpError } from "@convstack/service-sdk/handlers";
import { lanyardFetch } from "@convstack/service-sdk/lanyard";
import { createFileRoute } from "@tanstack/react-router";
import { checkPageAccess } from "~/lib/page-permissions";

export const Route = createFileRoute("/api/pages/$slug/permissions/new")({
	server: {
		handlers: {
			/** @openapi
			 * summary: Get dynamic form fields for adding a page permission
			 * description: Returns department options. Requires admin access to the page.
			 * response: 200
			 *   fields: array
			 */
			GET: createHandler({
				handler: async (ctx) => {
					const slug = (ctx.input as { slug: string }).slug;

					const access = await checkPageAccess(ctx, slug);
					if (!access.canAdmin) {
						throw httpError.forbidden("Admin access to this page is required");
					}

					// lanyard lists the departments that aren't private; the admin's
					// own memberships add any private ones they belong to
					const departments = new Map(
						ctx.orgRoles.map((r) => [r.orgId, r.name ?? r.slug]),
					);
					try {
						const response = await lanyardFetch("/api/services/departments");
						if (response.ok) {
							const data = (await response.json()) as {
								rows?: Array<{ id: string; name: string }>;
							};
							for (const d of data.rows ?? []) departments.set(d.id, d.name);
						} else {
							console.warn(
								`lanyard /api/services/departments answered ${response.status}`,
							);
						}
					} catch (err) {
						console.warn(
							"lanyard /api/services/departments failed:",
							err instanceof Error ? err.message : err,
						);
					}

					return {
						fields: [
							{
								key: "departmentId",
								label: "Department",
								type: "select",
								required: true,
								options: [...departments]
									.map(([value, label]) => ({ label, value }))
									.sort((a, b) => a.label.localeCompare(b.label)),
								value: "",
							},
							{
								key: "access",
								label: "Access Level",
								type: "select",
								required: true,
								options: [
									{ label: "Read", value: "read" },
									{ label: "Read & Write", value: "write" },
									{
										label: "Admin (manage permissions + delete)",
										value: "admin",
									},
								],
								value: "",
							},
						],
					};
				},
			}),
		},
	},
});
