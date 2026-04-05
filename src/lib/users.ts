// Cache user names for 10 minutes
const cache = new Map<string, { name: string; expires: number }>();
const CACHE_TTL = 10 * 60 * 1000;

/**
 * Resolve a user ID to a display name via Lanyard's admin API.
 * Returns the user's name, or falls back to a truncated ID.
 */
export async function resolveUserName(userId: string): Promise<string> {
	if (userId === "system") return "System";

	const cached = cache.get(userId);
	if (cached && cached.expires > Date.now()) {
		return cached.name;
	}

	const lanyardUrl = process.env.LANYARD_URL || "http://localhost:3000";
	const serviceKey = process.env.LANYARD_SERVICE_KEY;

	if (!serviceKey) {
		return truncateId(userId);
	}

	try {
		const response = await fetch(`${lanyardUrl}/api/users/${userId}`, {
			headers: { Authorization: `ServiceKey ${serviceKey}` },
		});

		if (!response.ok) {
			return truncateId(userId);
		}

		const data = await response.json();
		const name = data.name || truncateId(userId);

		cache.set(userId, { name, expires: Date.now() + CACHE_TTL });
		return name;
	} catch {
		return truncateId(userId);
	}
}

/**
 * Resolve multiple user IDs to names in parallel.
 */
export async function resolveUserNames(
	userIds: string[],
): Promise<Map<string, string>> {
	const unique = [...new Set(userIds)];
	const entries = await Promise.all(
		unique.map(async (id) => [id, await resolveUserName(id)] as const),
	);
	return new Map(entries);
}

function truncateId(id: string): string {
	return id.length > 8 ? `${id.slice(0, 8)}...` : id;
}
