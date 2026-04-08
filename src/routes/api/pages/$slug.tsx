import { createFileRoute } from "@tanstack/react-router";
import { nanoid } from "nanoid";
import { db } from "~/db";
import { wikiPage, wikiRevision } from "~/db/schema";
import { getRequestUser } from "~/lib/auth";
import { checkPageAccess } from "~/lib/page-permissions";
import { resolveUserName } from "~/lib/users";
import { resolveWikiLinks } from "~/lib/wiki-links";
import { ensureMainPage } from "~/server/services/init";

export const Route = createFileRoute("/api/pages/$slug")({
	server: {
		handlers: {
			/** @openapi
			 * summary: Get a wiki page by slug
			 * response: 200
			 *   title: string
			 *   content: string
			 *   metadata: object
			 *   actions: object
			 * error: 404 Page not found
			 * error: 403 Department access denied
			 */
			GET: async ({
				request,
				params,
			}: {
				request: Request;
				params: { slug: string };
			}) => {
				const { eq } = await import("drizzle-orm");

				// Auto-create main page on first access if it doesn't exist
				if (params.slug === "main-page") {
					await ensureMainPage();
				}

				const [page] = await db
					.select()
					.from(wikiPage)
					.where(eq(wikiPage.slug, params.slug))
					.limit(1);

				if (!page) {
					return new Response(JSON.stringify({ error: "Page not found" }), {
						status: 404,
						headers: { "Content-Type": "application/json" },
					});
				}

				// Check page-level permissions (with parent inheritance)
				const access = await checkPageAccess(request, params.slug);
				if (!access.canRead) {
					return new Response(
						JSON.stringify({ error: "You do not have access to this page" }),
						{ status: 403, headers: { "Content-Type": "application/json" } },
					);
				}

				const resolvedContent = await resolveWikiLinks(
					page.content,
					"guidebook",
				);

				const canEdit = access.canWrite;

				const editorName = await resolveUserName(page.updatedBy);

				const response: Record<string, unknown> = {
					title: page.title,
					content: resolvedContent,
					metadata: {
						lastEditedBy: editorName,
						lastEditedAt: page.updatedAt,
					},
				};

				if (canEdit) {
					const actions: Record<string, string> = {
						editLink: `/pages/${page.slug}/edit`,
						historyLink: `/pages/${page.slug}/history`,
					};
					if (access.canAdmin) {
						actions.permissionsLink = `/pages/${page.slug}/permissions`;
					}
					response.actions = actions;
				}

				return new Response(JSON.stringify(response), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			},

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
			PUT: async ({
				request,
				params,
			}: {
				request: Request;
				params: { slug: string };
			}) => {
				const user = getRequestUser(request);
				if (!user) {
					return new Response(JSON.stringify({ error: "Unauthorized" }), {
						status: 401,
						headers: { "Content-Type": "application/json" },
					});
				}
				const { eq, like, sql } = await import("drizzle-orm");

				const [page] = await db
					.select()
					.from(wikiPage)
					.where(eq(wikiPage.slug, params.slug))
					.limit(1);

				if (!page) {
					return new Response(JSON.stringify({ error: "Page not found" }), {
						status: 404,
						headers: { "Content-Type": "application/json" },
					});
				}

				const access = await checkPageAccess(request, params.slug);
				if (!access.canWrite) {
					return new Response(
						JSON.stringify({ error: "You do not have write access to this page" }),
						{ status: 403, headers: { "Content-Type": "application/json" } },
					);
				}

				let body: {
					title?: string;
					content?: string;
					editSummary?: string;
				};
				try {
					body = await request.json();
				} catch {
					return new Response(JSON.stringify({ error: "Invalid JSON" }), {
						status: 400,
						headers: { "Content-Type": "application/json" },
					});
				}

				const { title, content, editSummary } = body;

				// Save current version as a revision before updating
				await db.insert(wikiRevision).values({
					id: nanoid(),
					pageId: page.id,
					title: page.title,
					content: page.content,
					editedBy: user.id,
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
						updatedBy: user.id,
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

				return new Response(JSON.stringify({ success: true }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			},

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
			DELETE: async ({
				request,
				params,
			}: {
				request: Request;
				params: { slug: string };
			}) => {
				const access = await checkPageAccess(request, params.slug);
				if (!access.canAdmin) {
					return new Response(
						JSON.stringify({ error: "Admin access required to delete" }),
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

				await db.delete(wikiPage).where(eq(wikiPage.id, page.id));

				return new Response(
					JSON.stringify({ success: true, redirect: "/guidebook" }),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					},
				);
			},
		},
	},
});
