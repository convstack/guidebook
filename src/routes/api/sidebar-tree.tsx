import { createFileRoute } from "@tanstack/react-router";
import { db } from "~/db";
import { wikiPage } from "~/db/schema";
import { getRequestUser } from "~/lib/auth";
import { getUserDepartmentIds } from "~/lib/departments";

interface TreeNode {
	title: string;
	slug: string;
	children: TreeNode[];
}

export const Route = createFileRoute("/api/sidebar-tree")({
	server: {
		handlers: {
			/** @openapi
			 * summary: Get hierarchical page tree for sidebar navigation
			 */
			GET: async ({ request }: { request: Request }) => {
				const { asc } = await import("drizzle-orm");
				const user = getRequestUser(request);

				// Resolve department memberships for filtering
				const isAdmin = user?.role === "admin";
				let deptIds: Set<string> = new Set();
				if (!isAdmin && user) {
					const auth = request.headers.get("authorization");
					if (auth) {
						deptIds = await getUserDepartmentIds(auth, user.id);
					}
				}

				const pages = await db
					.select({
						title: wikiPage.title,
						slug: wikiPage.slug,
						parentSlug: wikiPage.parentSlug,
						sortOrder: wikiPage.sortOrder,
						departmentId: wikiPage.departmentId,
					})
					.from(wikiPage)
					.orderBy(asc(wikiPage.sortOrder), asc(wikiPage.title));

				// Filter out department-restricted pages the user can't access
				const accessible = isAdmin
					? pages
					: pages.filter((p) => !p.departmentId || deptIds.has(p.departmentId));

				// Build tree from flat list
				const nodeMap = new Map<string, TreeNode>();
				const roots: TreeNode[] = [];

				for (const page of accessible) {
					nodeMap.set(page.slug, {
						title: page.title,
						slug: page.slug,
						children: [],
					});
				}

				for (const page of accessible) {
					const node = nodeMap.get(page.slug);
					if (!node) continue;

					const parent = page.parentSlug
						? nodeMap.get(page.parentSlug)
						: undefined;
					if (parent) {
						parent.children.push(node);
					} else {
						roots.push(node);
					}
				}

				return new Response(JSON.stringify(roots), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			},
		},
	},
});
