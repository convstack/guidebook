import { createHandler, httpError } from "@convstack/service-sdk/handlers";
import { createFileRoute } from "@tanstack/react-router";
import { checkPageAccess } from "~/lib/page-permissions";
import { resolveUserName } from "~/lib/users";

export const Route = createFileRoute("/api/pages/$slug/revisions/$revisionId")({
	server: {
		handlers: {
			/** @openapi
			 * summary: Get a specific revision with diff
			 * description: Returns revision content and line-by-line diff against current version.
			 * auth: user
			 * response: 200
			 *   title: string
			 *   content: string
			 *   metadata: object
			 *   diff: array
			 *   topBar: object
			 * error: 401 Unauthorized
			 * error: 404 Page not found
			 * error: 404 Revision not found
			 */
			GET: createHandler({
				handler: async (ctx) => {
					if (!ctx.user) throw httpError.unauthorized();

					const { db } = await import("~/db");
					const { wikiPage, wikiRevision } = await import("~/db/schema");
					const { and, eq } = await import("drizzle-orm");
					const { slug, revisionId } = ctx.input as {
						slug: string;
						revisionId: string;
					};

					const [page] = await db
						.select({
							id: wikiPage.id,
							title: wikiPage.title,
							content: wikiPage.content,
						})
						.from(wikiPage)
						.where(eq(wikiPage.slug, slug))
						.limit(1);
					if (!page) throw httpError.notFound("Page not found");

					const access = await checkPageAccess(ctx, slug);
					if (!access.canRead) throw httpError.notFound("Page not found");

					// a revision of another page is not found here, whatever its id
					const [revision] = await db
						.select()
						.from(wikiRevision)
						.where(
							and(
								eq(wikiRevision.id, revisionId),
								eq(wikiRevision.pageId, page.id),
							),
						)
						.limit(1);

					if (!revision) throw httpError.notFound("Revision not found");

					const editorName = await resolveUserName(revision.editedBy);

					// Build a simple line diff between revision and current content
					const diff = buildDiff(revision.content, page.content);

					const topBar = {
						breadcrumbs: [
							{ label: page.title, href: `/pages/${slug}` },
							{ label: "History", href: `/pages/${slug}/history` },
							{ label: "Revision" },
						],
					};

					return {
						title: `${revision.title} (revision)`,
						content: revision.content,
						metadata: {
							lastEditedBy: editorName,
							lastEditedAt: revision.createdAt?.toISOString(),
						},
						diff,
						topBar,
					};
				},
			}),
		},
	},
});

interface DiffLine {
	type: "added" | "removed" | "unchanged";
	text: string;
}

/**
 * Build a simple line-by-line diff between old (revision) and new (current) content.
 * Uses a basic LCS-based approach.
 */
function buildDiff(oldText: string, newText: string): DiffLine[] {
	const oldLines = oldText.split("\n");
	const newLines = newText.split("\n");

	// Build LCS table
	const m = oldLines.length;
	const n = newLines.length;
	const dp: number[][] = Array.from({ length: m + 1 }, () =>
		Array(n + 1).fill(0),
	);

	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			if (oldLines[i - 1] === newLines[j - 1]) {
				dp[i][j] = dp[i - 1][j - 1] + 1;
			} else {
				dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
			}
		}
	}

	// Backtrack to produce diff
	const result: DiffLine[] = [];
	let i = m;
	let j = n;

	while (i > 0 || j > 0) {
		if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
			result.push({ type: "unchanged", text: oldLines[i - 1] });
			i--;
			j--;
		} else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
			result.push({ type: "added", text: newLines[j - 1] });
			j--;
		} else {
			result.push({ type: "removed", text: oldLines[i - 1] });
			i--;
		}
	}

	return result.reverse();
}
