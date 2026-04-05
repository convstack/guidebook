const LANYARD_URL = process.env.LANYARD_URL || "http://localhost:3000";

// Cache department memberships per user for 5 minutes
const cache = new Map<string, { orgIds: Set<string>; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Fetch the list of department/organization IDs the user belongs to.
 * Uses the user's Bearer token to call Lanyard's /api/user/departments endpoint.
 */
export async function getUserDepartmentIds(
	authorization: string,
	userId: string,
): Promise<Set<string>> {
	const cached = cache.get(userId);
	if (cached && cached.expires > Date.now()) {
		return cached.orgIds;
	}

	try {
		const response = await fetch(`${LANYARD_URL}/api/user/departments`, {
			headers: { Authorization: authorization },
		});

		if (!response.ok) {
			return new Set();
		}

		const data = await response.json();
		const orgIds = new Set<string>(
			(data.rows ?? []).map((row: { id: string }) => row.id),
		);

		cache.set(userId, { orgIds, expires: Date.now() + CACHE_TTL });
		return orgIds;
	} catch {
		return new Set();
	}
}

/**
 * Check if a user has access to a page based on its departmentId.
 * Returns null if access is allowed, or a 403 Response if denied.
 *
 * - Pages with no departmentId are accessible to everyone.
 * - Pages with a departmentId require the user to be a member of that department,
 *   or have an admin role.
 */
export async function checkDepartmentAccess(
	request: Request,
	departmentId: string | null,
	userRole: string,
): Promise<Response | null> {
	// No department restriction — accessible to all
	if (!departmentId) return null;

	// Admins can access all pages
	if (userRole === "admin") return null;

	const authorization = request.headers.get("authorization");
	const userId = request.headers.get("x-user-id");

	if (!authorization || !userId) {
		return new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		});
	}

	const departments = await getUserDepartmentIds(authorization, userId);

	if (!departments.has(departmentId)) {
		return new Response(
			JSON.stringify({ error: "You do not have access to this page" }),
			{ status: 403, headers: { "Content-Type": "application/json" } },
		);
	}

	return null;
}
