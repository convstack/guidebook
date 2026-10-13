import { beforeEach, describe, expect, it, vi } from "vitest";
import { seed } from "../support/fake-db";
import { handlers } from "../support/route";

let servicePermissions: string[] = [];

vi.mock("~/lib/auth", () => ({
	requireUser: async () => ({
		id: "writer",
		name: "Writer",
		email: "writer@x.test",
		permissions: servicePermissions,
		orgRoles: [],
	}),
	requirePermission: async (_request: Request, permission: string) =>
		servicePermissions.includes(permission)
			? null
			: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
}));
let storageOn = false;

vi.mock("~/lib/s3", () => ({
	isS3Configured: () => storageOn,
	uploadFile: async () => "https://files.test/a.png",
}));

const upload = async (pageSlug?: string) => {
	const { Route } = await import("~/routes/api/upload/image");
	const query = pageSlug ? `?pageSlug=${pageSlug}` : "";
	return handlers(Route).POST({
		request: new Request(`http://x/api/upload/image${query}`, {
			method: "POST",
		}),
	});
};

// past the access check the route answers 501, because storage is off here
const PASSED = 501;

beforeEach(() => {
	storageOn = false;
	servicePermissions = ["guidebook:pages:write"];
	seed({
		wikiPage: [
			{ id: "p-open", slug: "open", parentSlug: null, createdBy: "author" },
			{ id: "p-secret", slug: "secret", parentSlug: null, createdBy: "author" },
		],
		wikiPagePermission: [
			{ id: "e1", pageId: "p-secret", departmentId: "d-crew", access: "write" },
		],
	});
});

describe("uploading an image for a page", () => {
	it("is allowed for a page the caller can write", async () => {
		expect((await upload("open")).status).toBe(PASSED);
	});

	it("is refused for a page the caller can't write", async () => {
		servicePermissions = ["guidebook:pages:read"];
		expect((await upload("open")).status).toBe(403);
	});

	it("answers a page that doesn't exist like a restricted one", async () => {
		const hidden = await upload("secret");
		const missing = await upload("nowhere");
		expect(hidden.status).toBe(403);
		expect(missing.status).toBe(403);
		expect(await missing.text()).toBe(await hidden.text());
	});

	it("falls back to the service permission when no page is named", async () => {
		expect((await upload()).status).toBe(PASSED);
		servicePermissions = [];
		expect((await upload()).status).toBe(403);
	});

	it("answers 400, not a crash, when the request carries no upload", async () => {
		storageOn = true;
		const res = await upload("open");
		expect(res.status).toBe(400);
		expect((await res.json()).error).toBe("No file provided");
	});
});
