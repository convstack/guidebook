import { describe, expect, it } from "vitest";
import { renameWikiLinks } from "~/lib/wiki-links";

const rename = (content: string, to = "New Page") =>
	renameWikiLinks(content, "Old Page", to);

describe("renameWikiLinks", () => {
	it("rewrites a plain link", () => {
		expect(rename("see [[Old Page]].")).toBe("see [[New Page]].");
	});

	it("keeps the display text of an aliased link", () => {
		expect(rename("see [[Old Page|the old one]].")).toBe(
			"see [[New Page|the old one]].",
		);
	});

	it("rewrites every spelling the page viewer resolves", () => {
		expect(rename("[[old page]] [[ Old Page ]] [[OLD PAGE|x]]")).toBe(
			"[[New Page]] [[New Page]] [[New Page|x]]",
		);
	});

	it("leaves links to other pages alone", () => {
		const content = "[[Old Page Two]] [[Older Page]] [[The Old Page]]";
		expect(rename(content)).toBe(content);
	});

	it("leaves code alone, as the page viewer does", () => {
		const content = "`[[Old Page]]` and\n```\n[[Old Page]]\n```";
		expect(rename(content)).toBe(content);
	});

	it("takes a new title with dollar signs literally", () => {
		expect(rename("[[Old Page]] [[Old Page|x]]", "Budget $$ $& $1")).toBe(
			"[[Budget $$ $& $1]] [[Budget $$ $& $1|x]]",
		);
	});

	it("handles an old title made of regex characters", () => {
		expect(
			renameWikiLinks("[[C++ (v2)]] [[C++ (v2)|x]]", "C++ (v2)", "D"),
		).toBe("[[D]] [[D|x]]");
	});

	it("returns the very same text when nothing links to the page", () => {
		const content = "Old Page is mentioned but not linked";
		expect(rename(content)).toBe(content);
	});
});
