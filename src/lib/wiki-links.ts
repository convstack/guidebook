interface WikiLinkMatch {
	fullMatch: string;
	inner: string;
	index: number;
}

/** Every [[...]] in the content that is not inside a code block or inline code. */
function findWikiLinks(content: string): WikiLinkMatch[] {
	const linkPattern = /\[\[([^\]]+)\]\]/g;

	// Extract code regions to protect them from replacement
	const codeRegions: Array<{ start: number; end: number }> = [];
	// Fenced code blocks (``` ... ```)
	const fencedBlock = /```[\s\S]*?```/g;
	let match: RegExpExecArray | null;
	match = fencedBlock.exec(content);
	while (match) {
		codeRegions.push({
			start: match.index,
			end: match.index + match[0].length,
		});
		match = fencedBlock.exec(content);
	}
	// Inline code (` ... `)
	const inlineCode = /`[^`]+`/g;
	match = inlineCode.exec(content);
	while (match) {
		codeRegions.push({
			start: match.index,
			end: match.index + match[0].length,
		});
		match = inlineCode.exec(content);
	}

	function isInsideCode(index: number): boolean {
		return codeRegions.some((r) => index >= r.start && index < r.end);
	}

	const matches: WikiLinkMatch[] = [];
	match = linkPattern.exec(content);
	while (match) {
		if (!isInsideCode(match.index)) {
			matches.push({
				fullMatch: match[0],
				inner: match[1],
				index: match.index,
			});
		}
		match = linkPattern.exec(content);
	}
	return matches;
}

/**
 * Point every link to oldTitle at newTitle, keeping any display text.
 * Matches titles the way the viewer resolves them: trimmed, any case.
 */
export function renameWikiLinks(
	content: string,
	oldTitle: string,
	newTitle: string,
): string {
	const wanted = oldTitle.trim().toLowerCase();
	let result = content;
	for (const m of findWikiLinks(content).reverse()) {
		const bar = m.inner.indexOf("|");
		const title = bar === -1 ? m.inner : m.inner.slice(0, bar);
		if (title.trim().toLowerCase() !== wanted) continue;
		const display = bar === -1 ? "" : m.inner.slice(bar);
		result =
			result.slice(0, m.index) +
			`[[${newTitle}${display}]]` +
			result.slice(m.index + m.fullMatch.length);
	}
	return result;
}

/**
 * Resolve [[wiki links]] in markdown content to HTML links.
 * - [[Page Name]] → <a href="/guidebook/pages/page-slug">Page Name</a>
 * - [[Page Name|Display Text]] → <a href="/guidebook/pages/page-slug">Display Text</a>
 * - Broken links → <a href="..." class="wiki-link-broken">...</a>
 *
 * Skips wiki links inside code blocks (``` ```) and inline code (` `).
 */
export async function resolveWikiLinks(
	content: string,
	serviceSlug: string,
	readablePageIds: Set<string> | null,
): Promise<string> {
	const { db } = await import("~/db");
	const { wikiPage } = await import("~/db/schema");

	const matches = findWikiLinks(content);

	if (matches.length === 0) return content;

	// Collect unique titles to look up
	const titles = new Set<string>();
	for (const m of matches) {
		const parts = m.inner.split("|");
		titles.add(parts[0].trim());
	}

	// Look up slugs for all referenced titles
	const allPages = await db
		.select({ id: wikiPage.id, title: wikiPage.title, slug: wikiPage.slug })
		.from(wikiPage);

	const titleToSlug = new Map<string, string>();
	for (const page of allPages) {
		// a page the viewer can't read looks like a page that doesn't exist
		if (readablePageIds && !readablePageIds.has(page.id)) continue;
		titleToSlug.set(page.title.toLowerCase(), page.slug);
	}

	// Replace wiki links (iterate in reverse to preserve indices)
	let result = content;
	for (const m of matches.reverse()) {
		const parts = m.inner.split("|");
		const title = parts[0].trim();
		const displayText = (parts[1] || parts[0]).trim();
		const slug = titleToSlug.get(title.toLowerCase());

		const replacement = slug
			? `<a href="/${serviceSlug}/pages/${slug}" class="wiki-link">${displayText}</a>`
			: `<a href="/${serviceSlug}/pages/${encodeURIComponent(title.toLowerCase().replace(/\s+/g, "-"))}" class="wiki-link-broken">${displayText}</a>`;

		result =
			result.slice(0, m.index) +
			replacement +
			result.slice(m.index + m.fullMatch.length);
	}

	return result;
}
