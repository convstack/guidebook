import { createFileRoute } from "@tanstack/react-router";
import { db } from "~/db";
import { wikiPage } from "~/db/schema";
import { getRequestUser } from "~/lib/auth";
import { getUserDepartmentIds } from "~/lib/departments";

export const Route = createFileRoute("/api/search")({
	server: {
		handlers: {
			GET: async ({ request }: { request: Request }) => {
				const { sql, desc } = await import("drizzle-orm");
				const user = getRequestUser(request);

				const url = new URL(request.url);
				const q = url.searchParams.get("q")?.trim();

				if (!q) {
					return new Response(
						JSON.stringify({
							columns: [
								{ key: "title", label: "Title" },
								{ key: "updatedBy", label: "Last Editor" },
								{ key: "updatedAt", label: "Updated" },
							],
							rows: [],
							total: 0,
						}),
						{ status: 200, headers: { "Content-Type": "application/json" } },
					);
				}

				// Resolve department memberships for filtering
				const isAdmin = user?.role === "admin";
				let deptIds: Set<string> = new Set();
				if (!isAdmin && user) {
					const auth = request.headers.get("authorization");
					if (auth) {
						deptIds = await getUserDepartmentIds(auth, user.id);
					}
				}

				const ilike = (term: string) => `%${term}%`;

				// Use PostgreSQL full-text search with ts_rank for relevance ordering.
				// Falls back to ILIKE for partial matches that full-text misses.
				const rows = await db
					.select({
						title: wikiPage.title,
						slug: wikiPage.slug,
						updatedBy: wikiPage.updatedBy,
						updatedAt: wikiPage.updatedAt,
						departmentId: wikiPage.departmentId,
						rank: sql<number>`ts_rank(
							to_tsvector('english', ${wikiPage.title} || ' ' || ${wikiPage.content}),
							plainto_tsquery('english', ${q})
						)`.as("rank"),
					})
					.from(wikiPage)
					.where(
						sql`
							to_tsvector('english', ${wikiPage.title} || ' ' || ${wikiPage.content})
							@@ plainto_tsquery('english', ${q})
							OR ${wikiPage.title} ILIKE ${ilike(q)}
							OR ${wikiPage.content} ILIKE ${ilike(q)}
						`,
					)
					.orderBy(desc(sql`rank`))
					.limit(50);

				// Filter out department-restricted pages the user can't access
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
					{ status: 200, headers: { "Content-Type": "application/json" } },
				);
			},
		},
	},
});
