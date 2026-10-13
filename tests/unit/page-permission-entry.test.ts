import { beforeEach, describe, expect, it, vi } from "vitest";
import { asUser } from "../support/caller";
import { seed, tables } from "../support/fake-db";
import { grant, resetAccess } from "../support/page-access";
import { handlers } from "../support/route";

vi.mock("~/lib/page-permissions", async () => {
	const { pageAccessModule } = await import("../support/page-access");
	return pageAccessModule;
});

const remove = async (slug: string, id: string) => {
	const { Route } = await import("~/routes/api/pages/$slug/permissions/$id");
	return handlers(Route).DELETE({
		request: new Request(`http://x/api/pages/${slug}/permissions/${id}`, {
			method: "DELETE",
		}),
		params: { slug, id },
	});
};

const entryIds = () => tables.wikiPagePermission.map((e) => e.id);

beforeEach(() => {
	resetAccess();
	asUser("writer", ["guidebook:pages:write"]);
	grant("open", "admin");
	seed({
		wikiPage: [
			{ id: "p-open", slug: "open" },
			{ id: "p-secret", slug: "secret" },
		],
		wikiPagePermission: [
			{ id: "e-open", pageId: "p-open", departmentId: "d1", access: "admin" },
			{
				id: "e-secret",
				pageId: "p-secret",
				departmentId: "d2",
				access: "admin",
			},
		],
	});
});

describe("removing a page permission entry", () => {
	it("removes an entry of the page it is addressed through", async () => {
		expect((await remove("open", "e-open")).status).toBe(200);
		expect(entryIds()).toEqual(["e-secret"]);
	});

	it("does not remove another page's entry through this page", async () => {
		expect((await remove("open", "e-secret")).status).toBe(404);
		expect(entryIds()).toEqual(["e-open", "e-secret"]);
	});

	it("is refused to someone who isn't an admin of the page", async () => {
		grant("open", "write");
		expect((await remove("open", "e-open")).status).toBe(403);
		expect(entryIds()).toEqual(["e-open", "e-secret"]);
	});
});
