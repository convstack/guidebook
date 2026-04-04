export function slugify(title: string): string {
	return title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

export async function uniqueSlug(title: string): Promise<string> {
	const { db } = await import("~/db");
	const { wikiPage } = await import("~/db/schema");
	const { eq } = await import("drizzle-orm");

	const slug = slugify(title);
	let suffix = 0;

	while (true) {
		const candidate = suffix === 0 ? slug : `${slug}-${suffix}`;
		const [existing] = await db
			.select({ id: wikiPage.id })
			.from(wikiPage)
			.where(eq(wikiPage.slug, candidate))
			.limit(1);
		if (!existing) return candidate;
		suffix++;
	}
}
