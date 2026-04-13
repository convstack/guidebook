import { createHandler } from "@convstack/service-sdk/handlers";
import { createFileRoute } from "@tanstack/react-router";
import { db } from "~/db";
import { wikiPage } from "~/db/schema";
import { getAccessiblePageIds } from "~/lib/page-permissions";
import { resolveUserNames } from "~/lib/users";

interface SearchMatch {
	snippet: string;
	matchText: string;
}

/**
 * Find all occurrences of `query` in `content` and return snippets
 * with surrounding context and the nearest heading anchor above each match.
 */
function extractMatches(
	content: string,
	query: string,
	maxMatches = 3,
): SearchMatch[] {
	const lower = content.toLowerCase();
	const qLower = query.toLowerCase();
	const matches: SearchMatch[] = [];

	let pos = 0;
	while (matches.length < maxMatches) {
		const idx = lower.indexOf(qLower, pos);
		if (idx === -1) break;

		// Extract snippet: ~60 chars before and after
		const start = Math.max(0, idx - 60);
		const end = Math.min(content.length, idx + query.length + 60);
		let snippet = content.slice(start, end).replace(/\n/g, " ");
		if (start > 0) snippet = `...${snippet}`;
		if (end < content.length) snippet = `${snippet}...`;

		// Extract the exact matched text as it appears in the content
		const matchText = content.slice(idx, idx + query.length);

		matches.push({ snippet, matchText });
		pos = idx + query.length;
	}

	// If no content matches found, title matched — return a single
	// result with the first ~120 chars of content as preview
	if (matches.length === 0) {
		const preview = content.slice(0, 120).replace(/\n/g, " ");
		matches.push({
			snippet: preview + (content.length > 120 ? "..." : ""),
			matchText: "",
		});
	}

	return matches;
}

export const Route = createFileRoute("/api/search")({
	server: {
		handlers: {
			/** @openapi
			 * summary: Full-text search across all pages
			 * description: Uses PostgreSQL tsvector + ILIKE. Returns up to 3 contextual snippets per page.
			 * query:
			 *   q: string (required) - Search query
			 * response: 200
			 *   results: array
			 */
			GET: createHandler({
				db,
				handler: async (ctx) => {
					const { sql, desc } = await import("drizzle-orm");

					const q = (ctx.input as { q?: string }).q?.trim();

					if (!q) {
						return { results: [] };
					}

					// Get the set of page IDs this user can access (null = no filtering needed)
					const accessibleIds = await getAccessiblePageIds(ctx.request);

					const ilike = (term: string) => `%${term}%`;

					const rows = await db
						.select({
							id: wikiPage.id,
							title: wikiPage.title,
							slug: wikiPage.slug,
							content: wikiPage.content,
							updatedBy: wikiPage.updatedBy,
							updatedAt: wikiPage.updatedAt,
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
						.limit(30);

					const filtered = accessibleIds
						? rows.filter((row) => accessibleIds.has(row.id))
						: rows;

					const userIds = filtered.map((r) => r.updatedBy);
					const nameMap = await resolveUserNames(userIds);

					// Build results with snippets per page
					const results = filtered.flatMap((row) => {
						const matches = extractMatches(row.content, q);
						return matches.map((match) => ({
							title: row.title,
							slug: row.slug,
							snippet: match.snippet,
							matchText: match.matchText,
							updatedBy: nameMap.get(row.updatedBy) || row.updatedBy,
							updatedAt: row.updatedAt,
						}));
					});

					return { results };
				},
			}),
		},
	},
});
