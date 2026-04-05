import { createFileRoute } from "@tanstack/react-router";
import { nanoid } from "nanoid";
import { db } from "~/db";
import { wikiPage } from "~/db/schema";
import { getRequestUser, requireStaff } from "~/lib/auth";
import { getUserDepartmentIds } from "~/lib/departments";
import { uniqueSlug } from "~/lib/slugify";

export const Route = createFileRoute("/api/pages")({
	server: {
		handlers: {
			GET: async ({ request }: { request: Request }) => {
				const { desc } = await import("drizzle-orm");
				const user = getRequestUser(request);

				// Filter out department-restricted pages the user can't access
				let deptIds: Set<string> = new Set();
				const isAdmin = user?.role === "admin";
				if (!isAdmin && user) {
					const auth = request.headers.get("authorization");
					if (auth) {
						deptIds = await getUserDepartmentIds(auth, user.id);
					}
				}

				const rows = await db
					.select({
						title: wikiPage.title,
						slug: wikiPage.slug,
						updatedBy: wikiPage.updatedBy,
						updatedAt: wikiPage.updatedAt,
						departmentId: wikiPage.departmentId,
					})
					.from(wikiPage)
					.orderBy(desc(wikiPage.updatedAt))
					.limit(200);

				// Filter in application layer (simpler than dynamic SQL)
				const filtered = isAdmin
					? rows
					: rows.filter(
							(row) => !row.departmentId || deptIds.has(row.departmentId),
						);

				return new Response(
					JSON.stringify({
						columns: [
							{ key: "title", label: "Title" },
							{ key: "updatedBy", label: "Last Editor" },
							{ key: "updatedAt", label: "Updated" },
						],
						rows: filtered.map((row) => ({
							title: row.title,
							slug: row.slug,
							updatedBy: row.updatedBy,
							updatedAt: row.updatedAt,
						})),
						total: filtered.length,
					}),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					},
				);
			},

			POST: async ({ request }: { request: Request }) => {
				const user = getRequestUser(request);
				if (!user) {
					return new Response(JSON.stringify({ error: "Unauthorized" }), {
						status: 401,
						headers: { "Content-Type": "application/json" },
					});
				}
				const staffError = requireStaff(user);
				if (staffError) return staffError;

				let body: { title?: string; content?: string; parentSlug?: string };
				try {
					body = await request.json();
				} catch {
					return new Response(JSON.stringify({ error: "Invalid JSON" }), {
						status: 400,
						headers: { "Content-Type": "application/json" },
					});
				}

				const { title, content = "", parentSlug } = body;
				if (!title || typeof title !== "string" || title.trim() === "") {
					return new Response(JSON.stringify({ error: "Title is required" }), {
						status: 400,
						headers: { "Content-Type": "application/json" },
					});
				}

				const slug = await uniqueSlug(title.trim());
				const id = nanoid();
				const now = new Date();

				await db.insert(wikiPage).values({
					id,
					title: title.trim(),
					slug,
					content,
					parentSlug: parentSlug || null,
					createdBy: user.id,
					updatedBy: user.id,
					createdAt: now,
					updatedAt: now,
				});

				return new Response(
					JSON.stringify({
						success: true,
						redirect: `/guidebook/pages/${slug}`,
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
