import { beforeEach, describe, expect, it, vi } from "vitest";
import { asNobody, asService, asUser } from "../support/caller";
import { seed } from "../support/fake-db";
import { grant, resetAccess } from "../support/page-access";
import { handlers } from "../support/route";

vi.mock("~/lib/page-permissions", async () => {
	const { pageAccessModule } = await import("../support/page-access");
	return pageAccessModule;
});

const get = async (slug: string) => {
	const { Route } = await import("~/routes/api/pages/$slug/history");
	return handlers(Route).GET({
		request: new Request(`http://x/api/pages/${slug}/history`),
		params: { slug },
	});
};

beforeEach(() => {
	resetAccess();
	asUser("reader", ["guidebook:pages:read"]);
	seed({
		wikiPage: [
			{ id: "p-open", slug: "open", title: "Open" },
			{ id: "p-secret", slug: "secret", title: "Secret" },
		],
		wikiRevision: [
			{
				id: "r-open",
				pageId: "p-open",
				title: "Open",
				editedBy: "writer",
				editSummary: "v2",
				createdAt: new Date("2026-10-01"),
			},
			{
				id: "r-secret",
				pageId: "p-secret",
				title: "Secret",
				editedBy: "owner",
				editSummary: "v2",
				createdAt: new Date("2026-10-02"),
			},
		],
	});
});

describe("page history", () => {
	it("is refused without a proof", async () => {
		asNobody();
		expect((await get("open")).status).toBe(401);
	});

	it("is refused to a service, which is not a user", async () => {
		asService("ledger");
		expect((await get("open")).status).toBe(401);
	});

	it("answers a page the caller can't read as if it didn't exist", async () => {
		grant("open", "read");
		const hidden = await get("secret");
		const missing = await get("nowhere");
		expect(hidden.status).toBe(404);
		expect(await hidden.text()).toBe(await missing.text());
	});

	it("lists the revisions of a readable page and no other page's", async () => {
		grant("open", "read");
		const res = await get("open");
		expect(res.status).toBe(200);
		const { events } = await res.json();
		expect(events.map((e: { id: string }) => e.id)).toEqual(["r-open"]);
	});

	it("reads a restricted page's history for someone who can read it", async () => {
		grant("secret", "read");
		expect((await get("secret")).status).toBe(200);
	});
});
