import { describe, expect, it } from "vitest";
import { drizzleModule, schemaModule } from "../support/fake-db";

describe("the fake schema", () => {
	it("refuses a column it doesn't know instead of matching nothing", () => {
		const table = Object.values(schemaModule)[0] as Record<string, unknown>;
		expect(() => table.noSuchColumn).toThrow(/no column/);
	});
});
