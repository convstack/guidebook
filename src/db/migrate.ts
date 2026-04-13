import { runMigrations } from "@convstack/service-sdk/db";

await runMigrations({ migrationsFolder: "./drizzle" });
