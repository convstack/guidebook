import { createHandler, httpError } from "@convstack/service-sdk/handlers";
import { createFileRoute } from "@tanstack/react-router";
import { nanoid } from "nanoid";
import { db } from "~/db";
import { wikiPage, wikiRevision } from "~/db/schema";
import { checkPageAccess } from "~/lib/page-permissions";
import { resolveUserName } from "~/lib/users";
import { resolveWikiLinks } from "~/lib/wiki-links";
import { ensureMainPage } from "~/server/services/init";

/** Walk the parent chain to produce breadcrumbs back to the root. Bounded by a visited set. */
async function buildPageBreadcrumbs(
	slug: string,
	title: string,
): Promise<Array<{ label: string; href?: string }>> {
	const { eq } = await import("drizzle-orm");
	const visited = new Set<string>();
	const ancestors: Array<{ label: string; slug: string }> = [];

	// Get the starting page's parentSlug
	const [start] = await db
		.select({ parentSlug: wikiPage.parentSlug })
		.from(wikiPage)
		.where(eq(wikiPage.slug, slug))
		.limit(1);

	let currentSlug: string | null = start?.parentSlug ?? null;

	while (currentSlug && !visited.has(currentSlug)) {
		visited.add(currentSlug);
		const [page] = await db
			.select({
				title: wikiPage.title,
				slug: wikiPage.slug,
				parentSlug: wikiPage.parentSlug,
			})
			.from(wikiPage)
			.where(eq(wikiPage.slug, currentSlug))
			.limit(1);
		if (!page) break;
		ancestors.unshift({ label: page.title, slug: page.slug });
		currentSlug = page.parentSlug;
	}

	// The leading service-name crumb is intentionally omitted — the dashboard's
	// top bar already shows the service icon + name to the left of breadcrumbs.
	return [
		...ancestors.map((a) => ({ label: a.label, href: `/pages/${a.slug}` })),
		{ label: title },
	];
}

export const Route = createFileRoute("/api/pages/$slug")({
	server: {
		handlers: {
			/** @openapi
			 * summary: Get a wiki page by slug
			 * response: 200
			 *   title: string
			 *   content: string
			 *   metadata: object
			 *   topBar: object
			 * error: 404 Page not found
			 * error: 403 Department access denied
			 */
			GET: createHandler({
				db,
				handler: async (ctx) => {
					const { eq } = await import("drizzle-orm");
					const slug = (ctx.input as { slug: string }).slug;

					// Auto-create main page on first access if it doesn't exist
					if (slug === "main-page") {
						await ensureMainPage();
					}

					const [page] = await db
						.select()
						.from(wikiPage)
						.where(eq(wikiPage.slug, slug))
						.limit(1);

					if (!page) throw httpError.notFound("Page not found");

					// Check page-level permissions (with parent inheritance)
					const access = await checkPageAccess(ctx.request, slug);
					if (!access.canRead) {
						throw httpError.forbidden("You do not have access to this page");
					}

					const resolvedContent = await resolveWikiLinks(
						page.content,
						"guidebook",
					);

					const canEdit = access.canWrite;

					const editorName = await resolveUserName(page.updatedBy);

					const breadcrumbs = await buildPageBreadcrumbs(page.slug, page.title);

					const topBarActions: Array<{
						id: string;
						label: string;
						icon?: string;
						link?: string;
						variant?: "primary" | "default" | "danger";
					}> = [];
					if (canEdit) {
						topBarActions.push({
							id: "edit",
							label: "Edit",
							icon: "pencil",
							link: `/pages/${page.slug}/edit`,
							variant: "primary",
						});
						topBarActions.push({
							id: "history",
							label: "History",
							icon: "clock",
							link: `/pages/${page.slug}/history`,
						});
					}
					if (access.canAdmin) {
						topBarActions.push({
							id: "permissions",
							label: "Permissions",
							icon: "shield",
							link: `/pages/${page.slug}/permissions`,
						});
					}

					return {
						title: page.title,
						content: resolvedContent,
						metadata: {
							lastEditedBy: editorName,
							lastEditedAt: page.updatedAt,
						},
						topBar: {
							breadcrumbs,
							actions: topBarActions,
						},
					};
				},
			}),

			/** @openapi
			 * summary: Update a wiki page
			 * description: Creates a revision of the previous content before updating.
			 * auth: staff
			 * body:
			 *   title: string - New page title
			 *   content: string - New markdown content
			 *   editSummary: string - Short description of the change
			 * response: 200
			 *   success: boolean
			 * error: 400 Invalid JSON
			 * error: 401 Unauthorized
			 * error: 403 Staff access required
			 * error: 404 Page not found
			 */
			PUT: createHandler({
				db,
				handler: async (ctx) => {
					if (!ctx.user) throw httpError.unauthorized();

					const { eq, like, sql } = await import("drizzle-orm");
					const { slug, title, content, editSummary } = ctx.input as {
						slug: string;
						title?: string;
						content?: string;
						editSummary?: string;
					};

					const [page] = await db
						.select()
						.from(wikiPage)
						.where(eq(wikiPage.slug, slug))
						.limit(1);

					if (!page) throw httpError.notFound("Page not found");

					const access = await checkPageAccess(ctx.request, slug);
					if (!access.canWrite) {
						throw httpError.forbidden(
							"You do not have write access to this page",
						);
					}

					// Save current version as a revision before updating
					await db.insert(wikiRevision).values({
						id: nanoid(),
						pageId: page.id,
						title: page.title,
						content: page.content,
						editedBy: ctx.user.id,
						editSummary: editSummary?.trim() || null,
						createdAt: new Date(),
					});

					const oldTitle = page.title;
					const newTitle = (title ?? oldTitle).trim();
					const newContent = content ?? page.content;

					await db
						.update(wikiPage)
						.set({
							title: newTitle,
							content: newContent,
							updatedBy: ctx.user.id,
							updatedAt: new Date(),
						})
						.where(eq(wikiPage.id, page.id));

					// If title changed, update wiki links in all other pages
					if (newTitle !== oldTitle) {
						const oldLinkPattern = `[[${oldTitle}]]`;
						const newLinkPattern = `[[${newTitle}]]`;

						// Find all pages that contain the old wiki link
						const affectedPages = await db
							.select({ id: wikiPage.id, content: wikiPage.content })
							.from(wikiPage)
							.where(like(wikiPage.content, `%${oldLinkPattern}%`));

						for (const affectedPage of affectedPages) {
							const updatedContent = affectedPage.content
								.split(oldLinkPattern)
								.join(newLinkPattern);
							await db
								.update(wikiPage)
								.set({ content: updatedContent, updatedAt: new Date() })
								.where(eq(wikiPage.id, affectedPage.id));
						}

						// Also handle aliased links: [[Old Title|Display Text]]
						const affectedAliased = await db
							.select({ id: wikiPage.id, content: wikiPage.content })
							.from(wikiPage)
							.where(sql`${wikiPage.content} LIKE ${`%[[${oldTitle}|%`}`);

						for (const affectedPage of affectedAliased) {
							const updatedContent = affectedPage.content.replace(
								new RegExp(
									`\\[\\[${oldTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\|`,
									"g",
								),
								`[[${newTitle}|`,
							);
							await db
								.update(wikiPage)
								.set({ content: updatedContent, updatedAt: new Date() })
								.where(eq(wikiPage.id, affectedPage.id));
						}
					}

					return { success: true };
				},
			}),

			/** @openapi
			 * summary: Delete a wiki page
			 * auth: admin
			 * response: 200
			 *   success: boolean
			 *   redirect: string
			 * error: 401 Unauthorized
			 * error: 403 Admin access required
			 * error: 404 Page not found
			 */
			DELETE: createHandler({
				db,
				handler: async (ctx) => {
					const { slug } = ctx.input as { slug: string };

					const access = await checkPageAccess(ctx.request, slug);
					if (!access.canAdmin) {
						throw httpError.forbidden("Admin access required to delete");
					}

					const { eq } = await import("drizzle-orm");

					const [page] = await db
						.select({ id: wikiPage.id })
						.from(wikiPage)
						.where(eq(wikiPage.slug, slug))
						.limit(1);

					if (!page) throw httpError.notFound("Page not found");

					await db.delete(wikiPage).where(eq(wikiPage.id, page.id));

					return { success: true, redirect: "/guidebook" };
				},
			}),
		},
	},
});
