interface Access {
	canRead: boolean;
	canWrite: boolean;
	canAdmin: boolean;
}

const none: Access = { canRead: false, canWrite: false, canAdmin: false };

export const access: Record<string, Partial<Access>> = {};
export const readable: { ids: Set<string> | null; lookups: number } = {
	ids: null,
	lookups: 0,
};

export function grant(slug: string, level: "read" | "write" | "admin") {
	access[slug] = {
		canRead: true,
		canWrite: level !== "read",
		canAdmin: level === "admin",
	};
}

export function resetAccess() {
	for (const slug of Object.keys(access)) delete access[slug];
	readable.ids = null;
	readable.lookups = 0;
}

export const pageAccessModule = {
	checkPageAccess: async (_viewer: unknown, slug: string) => ({
		...none,
		...access[slug],
	}),
	getAccessiblePageIds: async () => {
		readable.lookups++;
		return readable.ids;
	},
};
