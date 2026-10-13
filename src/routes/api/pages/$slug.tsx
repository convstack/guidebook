import { createHandler, httpError } from "@convstack/service-sdk/handlers";
import { createFileRoute } from "@tanstack/react-router";
import { nanoid } from "nanoid";
import { db } from "~/db";
import { wikiPage, wikiRevision } from "~/db/schema";
import { checkPageAccess, getAccessiblePageIds } from "~/lib/page-permissions";
import { resolveUserName } from "~/lib/users";
import { renameWikiLinks, resolveWikiLinks } from "~/lib/wiki-links";
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
					const access = await checkPageAccess(ctx, slug);
					if (!access.canRead) throw httpError.notFound("Page not found");

					const resolvedContent = await resolveWikiLinks(
						page.content,
						"guidebook",
						page.content.includes("[[")
							? await getAccessiblePageIds(ctx)
							: null,
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

					const { eq, ilike } = await import("drizzle-orm");
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

					const access = await checkPageAccess(ctx, slug);
					if (!access.canRead) throw httpError.notFound("Page not found");
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

					// If title changed, update wiki links in the pages the renamer can edit
					if (newTitle !== oldTitle) {
						const userId = ctx.user.id;
						const summary = `Link updated after "${oldTitle}" was renamed`;
						const columns = {
							id: wikiPage.id,
							slug: wikiPage.slug,
							title: wikiPage.title,
							content: wikiPage.content,
						};
						// restricted pages the renamer can't edit keep the old title
						const rewrite = async (
							affected: {
								id: string;
								slug: string;
								title: string;
								content: string;
							},
							updatedContent: string,
						) => {
							const reach = await checkPageAccess(ctx, affected.slug);
							if (!reach.canWrite) return;
							if (affected.id !== page.id) {
								await db.insert(wikiRevision).values({
									id: nanoid(),
									pageId: affected.id,
									title: affected.title,
									content: affected.content,
									editedBy: userId,
									editSummary: summary,
									createdAt: new Date(),
								});
							}
							await db
								.update(wikiPage)
								.set({
									content: updatedContent,
									updatedBy: userId,
									updatedAt: new Date(),
								})
								.where(eq(wikiPage.id, affected.id));
						};

						// any page mentioning the title; the link parser decides which
						// of them really link to it
						const mentioning = await db
							.select(columns)
							.from(wikiPage)
							.where(
								ilike(
									wikiPage.content,
									`%${oldTitle.replace(/[\\%_]/g, "\\$&")}%`,
								),
							);

						for (const affectedPage of mentioning) {
							const updatedContent = renameWikiLinks(
								affectedPage.content,
								oldTitle,
								newTitle,
							);
							if (updatedContent === affectedPage.content) continue;
							await rewrite(affectedPage, updatedContent);
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

					const access = await checkPageAccess(ctx, slug);
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
