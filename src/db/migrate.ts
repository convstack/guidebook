import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

async function main() {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error("DATABASE_URL is required");
	const db = drizzle(databaseUrl);

	console.log("Running migrations...");
	await migrate(db, { migrationsFolder: "./drizzle" });
	console.log("Migrations complete.");

	process.exit(0);
}

main().catch((err) => {
	console.error("Migration failed:", err);
	process.exit(1);
});
