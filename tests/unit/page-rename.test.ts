import { beforeEach, describe, expect, it, vi } from "vitest";
import { asUser } from "../support/caller";
import { seed, tables } from "../support/fake-db";
import { grant, resetAccess } from "../support/page-access";
import { handlers } from "../support/route";

vi.mock("~/lib/page-permissions", async () => {
	const { pageAccessModule } = await import("../support/page-access");
	return pageAccessModule;
});

const rename = async (slug: string, title: string) => {
	const { Route } = await import("~/routes/api/pages/$slug");
	return handlers(Route).PUT({
		request: new Request(`http://x/api/pages/${slug}`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ title }),
		}),
		params: { slug },
	});
};

const page = (id: string) => tables.wikiPage.find((p) => p.id === id);
const revisionsOf = (pageId: string) =>
	tables.wikiRevision.filter((r) => r.pageId === pageId);

beforeEach(() => {
	resetAccess();
	asUser("renamer", ["guidebook:pages:write"]);
	grant("open", "write");
	grant("linker", "write");
	seed({
		wikiPage: [
			{ id: "p-open", slug: "open", title: "Open Page", content: "open" },
			{
				id: "p-secret",
				slug: "secret",
				title: "Secret",
				content: "see [[Open Page]]",
			},
			{
				id: "p-linker",
				slug: "linker",
				title: "Linker",
				content: "[[Open Page]] and [[Open Page|the open one]]",
			},
		],
		wikiRevision: [],
	});
});

describe("renaming a page", () => {
	it("rewrites links however they are spelled, with a title full of dollar signs", async () => {
		const linker = page("p-linker");
		if (linker) linker.content = "[[open page]] and [[OPEN PAGE|the open one]]";
		await rename("open", "Budget $$ $&");
		expect(page("p-linker")?.content).toBe(
			"[[Budget $$ $&]] and [[Budget $$ $&|the open one]]",
		);
	});

	it("leaves a page that only mentions the title, and records nothing for it", async () => {
		grant("mention", "write");
		tables.wikiPage.push({
			id: "p-mention",
			slug: "mention",
			title: "Mention",
			content: "Open Page is mentioned, and 100% of_it is not a link",
		});
		await rename("open", "Renamed Page");
		expect(page("p-mention")?.content).toBe(
			"Open Page is mentioned, and 100% of_it is not a link",
		);
		expect(revisionsOf("p-mention")).toEqual([]);
	});

	it("credits the renamer on the pages it rewrites", async () => {
		await rename("open", "Renamed Page");
		expect(page("p-linker")?.updatedBy).toBe("renamer");
	});

	it("answers a page the caller can't read as if it didn't exist", async () => {
		const hidden = await rename("secret", "Renamed");
		const missing = await rename("nowhere", "Renamed");
		expect(hidden.status).toBe(404);
		expect(await hidden.text()).toBe(await missing.text());
	});

	it("refuses someone who can read the page but not write it", async () => {
		grant("secret", "read");
		expect((await rename("secret", "Renamed")).status).toBe(403);
	});

	it("rewrites the links in pages the renamer can edit", async () => {
		expect((await rename("open", "Renamed Page")).status).toBe(200);
		expect(page("p-linker")?.content).toBe(
			"[[Renamed Page]] and [[Renamed Page|the open one]]",
		);
	});

	it("leaves a restricted page the renamer can't edit alone", async () => {
		await rename("open", "Renamed Page");
		expect(page("p-secret")?.content).toBe("see [[Open Page]]");
		expect(revisionsOf("p-secret")).toEqual([]);
	});

	it("records a revision for each page it rewrites", async () => {
		await rename("open", "Renamed Page");
		const [revision] = revisionsOf("p-linker");
		expect(revision.content).toBe(
			"[[Open Page]] and [[Open Page|the open one]]",
		);
		expect(revisionsOf("p-linker")).toHaveLength(1);
		expect(revision.editedBy).toBe("renamer");
		expect(String(revision.editSummary)).toContain("Open Page");
	});
});
