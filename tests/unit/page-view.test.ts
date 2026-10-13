import { beforeEach, describe, expect, it, vi } from "vitest";
import { asUser } from "../support/caller";
import { seed } from "../support/fake-db";
import { grant, readable, resetAccess } from "../support/page-access";
import { handlers } from "../support/route";

vi.mock("~/lib/page-permissions", async () => {
	const { pageAccessModule } = await import("../support/page-access");
	return pageAccessModule;
});

const view = async (slug: string) => {
	const { Route } = await import("~/routes/api/pages/$slug");
	return handlers(Route).GET({
		request: new Request(`http://x/api/pages/${slug}`),
		params: { slug },
	});
};

beforeEach(() => {
	resetAccess();
	asUser("reader", ["guidebook:pages:read"]);
	grant("plain", "read");
	grant("linked", "read");
	seed({
		wikiPage: [
			{ id: "p1", slug: "plain", title: "Plain", content: "no links here" },
			{ id: "p2", slug: "linked", title: "Linked", content: "see [[Plain]]" },
			{ id: "p3", slug: "linked-but-hidden", title: "Hidden", content: "x" },
		],
	});
});

describe("viewing a page", () => {
	it("answers a page the caller can't read as if it didn't exist", async () => {
		const hidden = await view("linked-but-hidden");
		const missing = await view("nowhere");
		expect(hidden.status).toBe(404);
		expect(await hidden.text()).toBe(await missing.text());
	});

	it("doesn't look up the readable pages when the page has no wiki links", async () => {
		expect((await view("plain")).status).toBe(200);
		expect(readable.lookups).toBe(0);
	});

	it("looks them up once when the page has wiki links", async () => {
		const res = await view("linked");
		expect(res.status).toBe(200);
		expect(readable.lookups).toBe(1);
		expect((await res.json()).content).toContain('class="wiki-link">Plain');
	});
});
