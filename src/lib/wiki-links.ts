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
): Promise<string> {
	const { db } = await import("~/db");
	const { wikiPage } = await import("~/db/schema");

	// Find all [[...]] patterns outside of code spans/blocks
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

	// Collect wiki link matches that are NOT inside code
	const matches: Array<{ fullMatch: string; inner: string; index: number }> =
		[];
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

	if (matches.length === 0) return content;

	// Collect unique titles to look up
	const titles = new Set<string>();
	for (const m of matches) {
		const parts = m.inner.split("|");
		titles.add(parts[0].trim());
	}

	// Look up slugs for all referenced titles
	const allPages = await db
		.select({ title: wikiPage.title, slug: wikiPage.slug })
		.from(wikiPage);

	const titleToSlug = new Map<string, string>();
	for (const page of allPages) {
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
