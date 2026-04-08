/**
 * Per-page permission checking with parent inheritance.
 *
 * Access levels are hierarchical: admin > write > read.
 *
 * Resolution order:
 * 1. Service-level `guidebook:admin` → full access to everything (escape hatch).
 * 2. Walk the page chain (current → parent → ...) to find explicit entries.
 * 3. If entries exist anywhere in the chain, apply them (union across depts
 *    the user belongs to). The highest level wins.
 * 4. If no entries anywhere in the chain, fall back to service-level
 *    `guidebook:pages:read` / `guidebook:pages:write`.
 * 5. Bootstrap: if the page itself has no explicit entries AND the user is
 *    the page's creator, they get implicit admin access on that page.
 */

import { db } from "~/db";
import { wikiPage, wikiPagePermission } from "~/db/schema";
import { getUserDepartmentIds } from "~/lib/departments";

export interface PageAccessResult {
	canRead: boolean;
	canWrite: boolean;
	canAdmin: boolean;
}

const NO_ACCESS: PageAccessResult = {
	canRead: false,
	canWrite: false,
	canAdmin: false,
};

const FULL_ACCESS: PageAccessResult = {
	canRead: true,
	canWrite: true,
	canAdmin: true,
};

function getServicePerms(request: Request): string[] {
	const header = request.headers.get("x-user-permissions") || "";
	return header.split(",").map((p) => p.trim());
}

function accessFromLevel(level: string): PageAccessResult {
	if (level === "admin") return FULL_ACCESS;
	if (level === "write")
		return { canRead: true, canWrite: true, canAdmin: false };
	return { canRead: true, canWrite: false, canAdmin: false };
}

function mergeAccess(
	a: PageAccessResult,
	b: PageAccessResult,
): PageAccessResult {
	return {
		canRead: a.canRead || b.canRead,
		canWrite: a.canWrite || b.canWrite,
		canAdmin: a.canAdmin || b.canAdmin,
	};
}

/**
 * Check if a user can access a specific page.
 * Walks up the parent chain to find the nearest permission entries.
 */
export async function checkPageAccess(
	request: Request,
	pageSlug: string,
): Promise<PageAccessResult> {
	const userId = request.headers.get("x-user-id");
	const authorization = request.headers.get("authorization");

	if (!userId || !authorization) {
		return NO_ACCESS;
	}

	// Escape hatch: service-level guidebook:admin bypasses everything
	const servicePerms = getServicePerms(request);
	if (servicePerms.includes("guidebook:admin")) {
		return FULL_ACCESS;
	}

	const userDepts = await getUserDepartmentIds(authorization, userId);

	const { eq } = await import("drizzle-orm");

	// Walk the page chain: current page → parent → grandparent → ...
	let currentSlug: string | null = pageSlug;
	const visited = new Set<string>();
	let pageCreator: string | null = null;
	let firstPageHasEntries = false;
	let firstPageChecked = false;

	while (currentSlug && !visited.has(currentSlug)) {
		visited.add(currentSlug);

		const [page] = await db
			.select({
				id: wikiPage.id,
				parentSlug: wikiPage.parentSlug,
				createdBy: wikiPage.createdBy,
			})
			.from(wikiPage)
			.where(eq(wikiPage.slug, currentSlug))
			.limit(1);

		if (!page) break;

		// Remember the creator of the target page for the bootstrap rule
		if (!firstPageChecked) {
			pageCreator = page.createdBy;
		}

		const permissions = await db
			.select({
				departmentId: wikiPagePermission.departmentId,
				access: wikiPagePermission.access,
			})
			.from(wikiPagePermission)
			.where(eq(wikiPagePermission.pageId, page.id));

		if (!firstPageChecked) {
			firstPageHasEntries = permissions.length > 0;
			firstPageChecked = true;
		}

		if (permissions.length > 0) {
			// Explicit entries — union all accesses across the user's departments
			let result = NO_ACCESS;
			for (const perm of permissions) {
				if (userDepts.has(perm.departmentId)) {
					result = mergeAccess(result, accessFromLevel(perm.access));
				}
			}
			return result;
		}

		currentSlug = page.parentSlug;
	}

	// Bootstrap: if the target page has no explicit entries AND the user
	// is the page's creator, grant admin access on that specific page.
	if (!firstPageHasEntries && pageCreator === userId) {
		return FULL_ACCESS;
	}

	// Fall back to service-level permissions
	return {
		canRead: servicePerms.includes("guidebook:pages:read"),
		canWrite: servicePerms.includes("guidebook:pages:write"),
		canAdmin: false,
	};
}

/**
 * Get all page IDs the user can read, for filtering lists.
 * Returns null if the user has unrestricted access (no filtering needed).
 */
export async function getAccessiblePageIds(
	request: Request,
): Promise<Set<string> | null> {
	const userId = request.headers.get("x-user-id");
	const authorization = request.headers.get("authorization");

	if (!userId || !authorization) {
		return new Set();
	}

	// Escape hatch: service-level guidebook:admin sees everything
	const servicePerms = getServicePerms(request);
	if (servicePerms.includes("guidebook:admin")) {
		return null;
	}

	const hasServiceRead = servicePerms.includes("guidebook:pages:read");

	const userDepts = await getUserDepartmentIds(authorization, userId);

	// Get all pages that have explicit permissions
	const restrictedPages = await db
		.select({
			pageId: wikiPagePermission.pageId,
			departmentId: wikiPagePermission.departmentId,
		})
		.from(wikiPagePermission);

	if (restrictedPages.length === 0 && hasServiceRead) {
		return null; // No restrictions anywhere, user has service-level access
	}

	// Group by page ID
	const pageRestrictions = new Map<string, Set<string>>();
	for (const rp of restrictedPages) {
		let set = pageRestrictions.get(rp.pageId);
		if (!set) {
			set = new Set();
			pageRestrictions.set(rp.pageId, set);
		}
		set.add(rp.departmentId);
	}

	// Get all pages to build the inheritance chain
	const allPages = await db
		.select({
			id: wikiPage.id,
			slug: wikiPage.slug,
			parentSlug: wikiPage.parentSlug,
			createdBy: wikiPage.createdBy,
		})
		.from(wikiPage);

	const slugToPage = new Map(allPages.map((p) => [p.slug, p]));
	const accessible = new Set<string>();

	for (const page of allPages) {
		// Bootstrap: creator always has access to their own unrestricted pages
		const pageHasEntries = pageRestrictions.has(page.id);
		if (!pageHasEntries && page.createdBy === userId) {
			accessible.add(page.id);
			continue;
		}

		// Walk up the chain to find the nearest restriction
		let currentSlug: string | null = page.slug;
		let foundRestriction = false;
		const visitedSlugs = new Set<string>();

		while (currentSlug && !visitedSlugs.has(currentSlug)) {
			visitedSlugs.add(currentSlug);
			const current = slugToPage.get(currentSlug);
			if (!current) break;

			const restrictions = pageRestrictions.get(current.id);
			if (restrictions) {
				foundRestriction = true;
				for (const deptId of restrictions) {
					if (userDepts.has(deptId)) {
						accessible.add(page.id);
						break;
					}
				}
				break;
			}

			currentSlug = current.parentSlug;
		}

		if (!foundRestriction && hasServiceRead) {
			accessible.add(page.id);
		}
	}

	return accessible;
}
