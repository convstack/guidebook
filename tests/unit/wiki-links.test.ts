import { beforeEach, describe, expect, it } from "vitest";
import { resolveWikiLinks } from "~/lib/wiki-links";
import { seed } from "../support/fake-db";

beforeEach(() => {
	seed({
		wikiPage: [
			{ id: "p-open", title: "Open Page", slug: "open-4f2a" },
			{ id: "p-secret", title: "Secret Page", slug: "secret-9c1d" },
		],
	});
});

const content = "[[Open Page]] and [[Secret Page]]";

describe("resolveWikiLinks", () => {
	it("resolves every page for a viewer who can read them all", async () => {
		const html = await resolveWikiLinks(content, "guidebook", null);
		expect(html).toContain('class="wiki-link">Open Page');
		expect(html).toContain('class="wiki-link">Secret Page');
	});

	it("shows a page the viewer can't read as a broken link", async () => {
		const html = await resolveWikiLinks(
			content,
			"guidebook",
			new Set(["p-open"]),
		);
		expect(html).toContain('class="wiki-link">Open Page');
		expect(html).toContain('class="wiki-link-broken">Secret Page');
		expect(html).not.toContain("secret-9c1d");
	});

	it("shows every link as broken for a viewer who can read nothing", async () => {
		const html = await resolveWikiLinks(content, "guidebook", new Set());
		expect(html).not.toContain('class="wiki-link">');
	});
});
