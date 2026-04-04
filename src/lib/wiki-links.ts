/**
 * Resolve [[wiki links]] in markdown content to HTML links.
 * - [[Page Name]] → <a href="/guidebook/pages/page-slug">Page Name</a>
 * - [[Page Name|Display Text]] → <a href="/guidebook/pages/page-slug">Display Text</a>
 * - Broken links → <a href="..." class="wiki-link-broken">...</a>
 */
export async function resolveWikiLinks(
	content: string,
	serviceSlug: string,
): Promise<string> {
	const { db } = await import("~/db");
	const { wikiPage } = await import("~/db/schema");

	// Find all [[...]] patterns
	const linkPattern = /\[\[([^\]]+)\]\]/g;
	const matches = [...content.matchAll(linkPattern)];
	if (matches.length === 0) return content;

	// Collect unique titles to look up
	const titles = new Set<string>();
	for (const match of matches) {
		const parts = match[1].split("|");
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

	// Replace wiki links
	return content.replace(linkPattern, (_match, inner: string) => {
		const parts = inner.split("|");
		const title = parts[0].trim();
		const displayText = (parts[1] || parts[0]).trim();
		const slug = titleToSlug.get(title.toLowerCase());

		if (slug) {
			return `<a href="/${serviceSlug}/pages/${slug}" class="wiki-link">${displayText}</a>`;
		}
		return `<a href="/${serviceSlug}/pages/${encodeURIComponent(title.toLowerCase().replace(/\s+/g, "-"))}" class="wiki-link-broken">${displayText}</a>`;
	});
}
