import { beforeEach, describe, expect, it } from "vitest";
import { checkPageAccess, getAccessiblePageIds } from "~/lib/page-permissions";
import { seed } from "../support/fake-db";

type Viewer = Parameters<typeof checkPageAccess>[0];

const viewer = (
	id: string,
	permissions: string[] = [],
	orgIds: string[] = [],
): Viewer => ({
	user: { id, name: id, email: `${id}@x.test` },
	permissions,
	orgRoles: orgIds.map((orgId) => ({ orgId, slug: orgId, role: "member" })),
});

beforeEach(() => {
	seed({
		wikiPage: [
			{ id: "p-root", slug: "root", parentSlug: null, createdBy: "author" },
			{ id: "p-child", slug: "child", parentSlug: "root", createdBy: "author" },
			{ id: "p-open", slug: "open", parentSlug: null, createdBy: "author" },
		],
		wikiPagePermission: [
			{ id: "e1", pageId: "p-root", departmentId: "d-crew", access: "write" },
		],
	});
});

describe("checkPageAccess", () => {
	it("gives guidebook:admin everything", async () => {
		expect(
			await checkPageAccess(viewer("x", ["guidebook:admin"]), "root"),
		).toEqual({ canRead: true, canWrite: true, canAdmin: true });
	});

	it("gives a department member the level its entry grants", async () => {
		expect(
			await checkPageAccess(
				viewer("m", ["guidebook:pages:read"], ["d-crew"]),
				"root",
			),
		).toEqual({ canRead: true, canWrite: true, canAdmin: false });
	});

	it("keeps out someone outside the entry's departments, whatever the service permission", async () => {
		expect(
			await checkPageAccess(
				viewer(
					"o",
					["guidebook:pages:read", "guidebook:pages:write"],
					["d-other"],
				),
				"root",
			),
		).toEqual({ canRead: false, canWrite: false, canAdmin: false });
	});

	it("applies a parent's entries to its children", async () => {
		expect(
			await checkPageAccess(viewer("o", ["guidebook:pages:read"]), "child"),
		).toMatchObject({ canRead: false });
		expect(
			await checkPageAccess(viewer("m", [], ["d-crew"]), "child"),
		).toMatchObject({ canRead: true, canWrite: true });
	});

	it("falls back to the service permissions where nothing is restricted", async () => {
		expect(
			await checkPageAccess(viewer("r", ["guidebook:pages:read"]), "open"),
		).toEqual({ canRead: true, canWrite: false, canAdmin: false });
		expect(await checkPageAccess(viewer("n"), "open")).toEqual({
			canRead: false,
			canWrite: false,
			canAdmin: false,
		});
	});

	it("makes the creator admin of an unrestricted page only", async () => {
		expect(await checkPageAccess(viewer("author"), "open")).toEqual({
			canRead: true,
			canWrite: true,
			canAdmin: true,
		});
		expect(await checkPageAccess(viewer("author"), "root")).toMatchObject({
			canRead: false,
		});
	});

	it("gives nobody a page when nobody is signed in", async () => {
		expect(
			await checkPageAccess(
				{ user: null, permissions: [], orgRoles: [] },
				"open",
			),
		).toEqual({ canRead: false, canWrite: false, canAdmin: false });
	});
});

describe("getAccessiblePageIds", () => {
	it("lists no restricted page for someone outside its departments", async () => {
		const ids = await getAccessiblePageIds(
			viewer("o", ["guidebook:pages:read"]),
		);
		expect(ids).not.toBeNull();
		expect(ids).toContain("p-open");
		expect(ids).not.toContain("p-root");
		expect(ids).not.toContain("p-child");
	});

	it("lists the restricted pages for a member of their department", async () => {
		const ids = await getAccessiblePageIds(
			viewer("m", ["guidebook:pages:read"], ["d-crew"]),
		);
		expect(ids).toContain("p-root");
		expect(ids).toContain("p-child");
	});

	it("lists everything for guidebook:admin", async () => {
		expect(
			await getAccessiblePageIds(viewer("x", ["guidebook:admin"])),
		).toBeNull();
	});
});
