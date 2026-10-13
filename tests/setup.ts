import { vi } from "vitest";

vi.mock("@convstack/service-sdk/handlers", async (importOriginal) => {
	const { withStubbedProof } = await import("./support/caller");
	return withStubbedProof(
		await importOriginal<typeof import("@convstack/service-sdk/handlers")>(),
	);
});
vi.mock("~/db", async () => {
	const { db } = await import("./support/fake-db");
	return { db };
});
vi.mock("~/db/schema", async () => {
	const { schemaModule } = await import("./support/fake-db");
	return schemaModule;
});
vi.mock("drizzle-orm", async () => {
	const { drizzleModule } = await import("./support/fake-db");
	return drizzleModule;
});
vi.mock("nanoid", () => {
	let n = 0;
	return { nanoid: () => `id-${++n}` };
});
vi.mock("~/lib/users", () => ({
	resolveUserName: async (id: string) => id,
	resolveUserNames: async (ids: string[]) => new Map(ids.map((i) => [i, i])),
}));
vi.mock("~/server/services/init", () => ({ ensureMainPage: async () => {} }));
