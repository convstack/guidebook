import { createFileRoute } from "@tanstack/react-router";
import { nanoid } from "nanoid";
import { db } from "~/db";
import { wikiPage, wikiPagePermission } from "~/db/schema";
import { checkPageAccess } from "~/lib/page-permissions";

export const Route = createFileRoute("/api/pages/$slug/permissions")({
	server: {
		handlers: {
			/** @openapi
			 * summary: Get page permission entries
			 * response: 200
			 *   columns: array
			 *   rows: array
			 *   rowActions: array
			 *   total: number
			 * error: 403 Admin access required
			 * error: 404 Page not found
			 */
			GET: async ({
				request,
				params,
			}: {
				request: Request;
				params: { slug: string };
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

				const [page] = await db
					.select({ id: wikiPage.id })
					.from(wikiPage)
					.where(eq(wikiPage.slug, params.slug))
					.limit(1);

				if (!page) {
					return new Response(JSON.stringify({ error: "Page not found" }), {
						status: 404,
						headers: { "Content-Type": "application/json" },
					});
				}

				const permissions = await db
					.select()
					.from(wikiPagePermission)
					.where(eq(wikiPagePermission.pageId, page.id));

				// Resolve department names from org roles header (best effort)
				const orgRolesHeader = request.headers.get("x-user-org-roles");
				const deptNames = new Map<string, string>();
				if (orgRolesHeader) {
					try {
						const orgRoles: Array<{ orgId: string; slug: string }> =
							JSON.parse(orgRolesHeader);
						for (const r of orgRoles) {
							deptNames.set(r.orgId, r.slug);
						}
					} catch {
						// ignore
					}
				}

				return new Response(
					JSON.stringify({
						columns: [
							{ key: "department", label: "Department" },
							{ key: "access", label: "Access" },
						],
						rows: permissions.map((p) => ({
							id: p.id,
							department: deptNames.get(p.departmentId) || p.departmentId,
							access: p.access,
						})),
						rowActions: [
							{
								label: "Remove",
								endpoint: `/api/pages/${params.slug}/permissions/:id`,
								method: "DELETE",
								variant: "danger",
								confirm: "Remove this permission entry?",
							},
						],
						total: permissions.length,
					}),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					},
				);
			},

			/** @openapi
			 * summary: Add a permission entry to a page
			 * description: Requires admin access to the target page (direct, inherited, or creator bootstrap).
			 * body:
			 *   departmentId: string (required) - Department to grant access
			 *   access: string (required) - Access level (read, write, admin)
			 * response: 201
			 *   success: boolean
			 *   id: string
			 * error: 400 Missing fields
			 * error: 403 Admin access required
			 * error: 404 Page not found
			 */
			POST: async ({
				request,
				params,
			}: {
				request: Request;
				params: { slug: string };
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

				let body: { departmentId?: string; access?: string };
				try {
					body = await request.json();
				} catch {
					return new Response(JSON.stringify({ error: "Invalid JSON" }), {
						status: 400,
						headers: { "Content-Type": "application/json" },
					});
				}

				if (!body.departmentId || !body.access) {
					return new Response(
						JSON.stringify({
							error: "departmentId and access are required",
						}),
						{
							status: 400,
							headers: { "Content-Type": "application/json" },
						},
					);
				}

				if (!["read", "write", "admin"].includes(body.access)) {
					return new Response(
						JSON.stringify({
							error: "access must be one of read, write, admin",
						}),
						{
							status: 400,
							headers: { "Content-Type": "application/json" },
						},
					);
				}

				const { eq } = await import("drizzle-orm");

				const [page] = await db
					.select({ id: wikiPage.id })
					.from(wikiPage)
					.where(eq(wikiPage.slug, params.slug))
					.limit(1);

				if (!page) {
					return new Response(JSON.stringify({ error: "Page not found" }), {
						status: 404,
						headers: { "Content-Type": "application/json" },
					});
				}

				const id = nanoid();
				await db.insert(wikiPagePermission).values({
					id,
					pageId: page.id,
					departmentId: body.departmentId,
					access: body.access,
					createdAt: new Date(),
				});

				return new Response(
					JSON.stringify({
						success: true,
						id,
						redirect: `/pages/${params.slug}/permissions`,
					}),
					{
						status: 201,
						headers: { "Content-Type": "application/json" },
					},
				);
			},
		},
	},
});
