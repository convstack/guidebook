import { beforeEach, describe, expect, it, vi } from "vitest";
import { asService, asUser } from "../support/caller";
import { seed } from "../support/fake-db";
import { grant, resetAccess } from "../support/page-access";
import { handlers } from "../support/route";

vi.mock("~/lib/page-permissions", async () => {
	const { pageAccessModule } = await import("../support/page-access");
	return pageAccessModule;
});

const get = async (slug: string, revisionId: string) => {
	const { Route } = await import(
		"~/routes/api/pages/$slug/revisions/$revisionId"
	);
	return handlers(Route).GET({
		request: new Request(`http://x/api/pages/${slug}/revisions/${revisionId}`),
		params: { slug, revisionId },
	});
};

beforeEach(() => {
	resetAccess();
	asUser("reader", ["guidebook:pages:read"]);
	seed({
		wikiPage: [
			{ id: "p-open", slug: "open", title: "Open", content: "open v2" },
			{ id: "p-secret", slug: "secret", title: "Secret", content: "secret v2" },
		],
		wikiRevision: [
			{
				id: "r-open",
				pageId: "p-open",
				title: "Open",
				content: "open v1",
				editedBy: "writer",
				createdAt: new Date("2026-10-01"),
			},
			{
				id: "r-secret",
				pageId: "p-secret",
				title: "Secret",
				content: "secret v1",
				editedBy: "owner",
				createdAt: new Date("2026-10-02"),
			},
		],
	});
});

describe("page revision", () => {
	it("is refused to a service, which is not a user", async () => {
		asService("ledger");
		expect((await get("open", "r-open")).status).toBe(401);
	});

	it("answers a page the caller can't read as if it didn't exist", async () => {
		grant("open", "read");
		const hidden = await get("secret", "r-secret");
		const missing = await get("nowhere", "r-secret");
		expect(hidden.status).toBe(404);
		expect(await hidden.text()).toBe(await missing.text());
	});

	it("is not found when the revision belongs to a different page", async () => {
		grant("open", "read");
		const res = await get("open", "r-secret");
		expect(res.status).toBe(404);
		expect(await res.text()).not.toContain("secret v1");
	});

	it("returns the revision of a readable page", async () => {
		grant("open", "read");
		const res = await get("open", "r-open");
		expect(res.status).toBe(200);
		expect((await res.json()).content).toBe("open v1");
	});
});
