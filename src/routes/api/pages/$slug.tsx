import { createFileRoute } from "@tanstack/react-router";
import { nanoid } from "nanoid";
import { db } from "~/db";
import { wikiPage, wikiRevision } from "~/db/schema";
import { getRequestUser, requireStaff } from "~/lib/auth";
import { checkDepartmentAccess } from "~/lib/departments";
import { resolveUserName } from "~/lib/users";
import { resolveWikiLinks } from "~/lib/wiki-links";
import { ensureMainPage } from "~/server/services/init";

export const Route = createFileRoute("/api/pages/$slug")({
	server: {
		handlers: {
			GET: async ({
				request,
				params,
			}: {
				request: Request;
				params: { slug: string };
			}) => {
				const { eq } = await import("drizzle-orm");
				const user = getRequestUser(request);

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

				// Department-restricted pages require membership
				const deptError = await checkDepartmentAccess(
					request,
					page.departmentId,
					user?.role ?? "user",
				);
				if (deptError) return deptError;

				const resolvedContent = await resolveWikiLinks(
					page.content,
					"guidebook",
				);

				const isStaffOrAdmin =
					user && (user.role === "staff" || user.role === "admin");

				const editorName = await resolveUserName(page.updatedBy);

				const response: Record<string, unknown> = {
					title: page.title,
					content: resolvedContent,
					metadata: {
						lastEditedBy: editorName,
						lastEditedAt: page.updatedAt,
					},
				};

				if (isStaffOrAdmin) {
					response.actions = {
						editLink: `/pages/${page.slug}/edit`,
						historyLink: `/pages/${page.slug}/history`,
					};
				}

				return new Response(JSON.stringify(response), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			},

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
				const staffError = requireStaff(user);
				if (staffError) return staffError;

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

				const deptError = await checkDepartmentAccess(
					request,
					page.departmentId,
					user.role,
				);
				if (deptError) return deptError;

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

			DELETE: async ({
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
				if (user.role !== "admin") {
					return new Response(
						JSON.stringify({ error: "Admin access required" }),
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
