import { createHandler, httpError } from "@convstack/service-sdk/handlers";
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
			 *   topBar: object
			 * error: 403 Admin access required
			 * error: 404 Page not found
			 */
			GET: createHandler({
				db,
				handler: async (ctx) => {
					const { eq } = await import("drizzle-orm");
					const slug = (ctx.input as { slug: string }).slug;

					const access = await checkPageAccess(ctx.request, slug);
					if (!access.canAdmin) {
						throw httpError.forbidden("Admin access to this page is required");
					}

					const [page] = await db
						.select({ id: wikiPage.id, title: wikiPage.title })
						.from(wikiPage)
						.where(eq(wikiPage.slug, slug))
						.limit(1);

					if (!page) throw httpError.notFound("Page not found");

					const permissions = await db
						.select()
						.from(wikiPagePermission)
						.where(eq(wikiPagePermission.pageId, page.id));

					// Resolve department names from org roles (best effort)
					const deptNames = new Map<string, string>();
					for (const r of ctx.orgRoles) {
						deptNames.set(r.orgId, r.slug);
					}

					const topBar = {
						breadcrumbs: [
							{ label: page.title, href: `/pages/${slug}` },
							{ label: "Permissions" },
						],
					};

					return {
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
								endpoint: `/api/pages/${slug}/permissions/:id`,
								method: "DELETE",
								variant: "danger",
								confirm: "Remove this permission entry?",
							},
						],
						total: permissions.length,
						topBar,
					};
				},
			}),

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
			POST: createHandler({
				db,
				handler: async (ctx) => {
					const { eq } = await import("drizzle-orm");
					const {
						slug,
						departmentId,
						access: accessLevel,
					} = ctx.input as {
						slug: string;
						departmentId?: string;
						access?: string;
					};

					const access = await checkPageAccess(ctx.request, slug);
					if (!access.canAdmin) {
						throw httpError.forbidden("Admin access to this page is required");
					}

					if (!departmentId || !accessLevel) {
						throw httpError.badRequest("departmentId and access are required");
					}

					if (!["read", "write", "admin"].includes(accessLevel)) {
						throw httpError.badRequest(
							"access must be one of read, write, admin",
						);
					}

					const [page] = await db
						.select({ id: wikiPage.id })
						.from(wikiPage)
						.where(eq(wikiPage.slug, slug))
						.limit(1);

					if (!page) throw httpError.notFound("Page not found");

					const id = nanoid();
					await db.insert(wikiPagePermission).values({
						id,
						pageId: page.id,
						departmentId,
						access: accessLevel,
						createdAt: new Date(),
					});

					return {
						success: true,
						id,
						redirect: `/pages/${slug}/permissions`,
					};
				},
			}),
		},
	},
});
