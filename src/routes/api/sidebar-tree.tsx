import { createHandler } from "@convstack/service-sdk/handlers";
import { createFileRoute } from "@tanstack/react-router";
import { db } from "~/db";
import { wikiPage } from "~/db/schema";
import { getAccessiblePageIds } from "~/lib/page-permissions";

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
			GET: createHandler({
				db,
				handler: async (ctx) => {
					const { asc } = await import("drizzle-orm");

					// Get the set of page IDs this user can access (null = no filtering needed)
					const accessibleIds = await getAccessiblePageIds(ctx.request);

					const pages = await db
						.select({
							id: wikiPage.id,
							title: wikiPage.title,
							slug: wikiPage.slug,
							parentSlug: wikiPage.parentSlug,
							sortOrder: wikiPage.sortOrder,
						})
						.from(wikiPage)
						.orderBy(asc(wikiPage.sortOrder), asc(wikiPage.title));

					const accessible = accessibleIds
						? pages.filter((p) => accessibleIds.has(p.id))
						: pages;

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

					return roots;
				},
			}),
		},
	},
});
