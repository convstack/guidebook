import { createHandler, httpError } from "@convstack/service-sdk/handlers";
import { createFileRoute } from "@tanstack/react-router";
import { checkPageAccess } from "~/lib/page-permissions";

const LANYARD_URL = process.env.LANYARD_URL || "http://localhost:3000";

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

					const access = await checkPageAccess(ctx.request, slug);
					if (!access.canAdmin) {
						throw httpError.forbidden("Admin access to this page is required");
					}

					// Fetch all departments from Lanyard
					const authorization = ctx.request.headers.get("authorization");
					let departments: Array<{ id: string; name: string }> = [];
					if (authorization) {
						try {
							const response = await fetch(`${LANYARD_URL}/api/departments`, {
								headers: { Authorization: authorization },
							});
							if (response.ok) {
								const data = await response.json();
								departments = (data.rows ?? []).map(
									(r: { id: string; name: string }) => ({
										id: r.id,
										name: r.name,
									}),
								);
							}
						} catch {
							// best effort
						}
					}

					return {
						fields: [
							{
								key: "departmentId",
								label: "Department",
								type: "select",
								required: true,
								options: departments.map((d) => ({
									label: d.name,
									value: d.id,
								})),
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
