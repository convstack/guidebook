/**
 * Scans src/routes/api/ for TanStack Router handler files and generates
 * an OpenAPI 3.0 spec from the file paths and HTTP methods found.
 *
 * Usage: bun run scripts/generate-openapi.ts
 *
 * This is a convention-based scanner — it derives paths from the file system
 * and methods from the handler declarations. No manual annotations needed.
 */

import { readdirSyncrrreadFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROUTES_DIR = join(process.cwd(), "src", "routes", "api");
const OUTPUT = join(process.cwd(), "public", "openapi.json");
const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;

interface PathItem {
	[method: string]: {
		operationId: string;
		tags: string[];
		parameters?: Array<{
			name: string;
			in: string;
			required: boolean;
			schema: { type: string };
		}>;
		responses: {
			"200": { description: string };
		};
	};
}

function walkDir(dir: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			files.push(...walkDir(full));
		} else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) {
			files.push(full);
		}
	}
	return files;
}

function filePathToApiPath(filePath: string): string {
	let rel = relative(ROUTES_DIR, filePath)
		.replace(/\\/g, "/")
		.replace(/\.tsx?$/, "");

	// Remove index suffix
	if (rel.endsWith("/index")) {
		rel = rel.slice(0, -6);
	}

	// Convert $param to {param}
	rel = rel.replace(/\$([a-zA-Z]+)/g, "{$1}");

	return `/api/${rel}`;
}

function extractMethods(content: string): string[] {
	const found: string[] = [];
	for (const method of METHODS) {
		// Match patterns like "GET:" or "GET :" in handler objects
		if (new RegExp(`${method}\\s*:`).test(content)) {
			found.push(method.toLowerCase());
		}
	}
	return found;
}

function extractParams(apiPath: string): string[] {
	const matches = apiPath.match(/\{(\w+)\}/g);
	return matches ? matches.map((m) => m.slice(1, -1)) : [];
}

function deriveTag(apiPath: string): string {
	const parts = apiPath.replace("/api/", "").split("/");
	// Use first meaningful segment as tag
	if (parts[0] === "my") return `my/${parts[1] || ""}`.replace(/\/$/, "");
	if (parts[0] === "webhooks") return "webhooks";
	return parts[0] || "general";
}

function generateSpec(): object {
	const pkg = JSON.parse(
		readFileSync(join(process.cwd(), "package.json"), "utf-8"),
	);

	const paths: Record<string, PathItem> = {};
	const files = walkDir(ROUTES_DIR);

	for (const file of files) {
		const content = readFileSync(file, "utf-8");
		const methods = extractMethods(content);
		if (methods.length === 0) continue;

		const apiPath = filePathToApiPath(file);
		const params = extractParams(apiPath);
		const tag = deriveTag(apiPath);

		if (!paths[apiPath]) {
			paths[apiPath] = {};
		}

		for (const method of methods) {
			const operationId = `${method}_${apiPath
				.replace(/[/{}-]/g, "_")
				.replace(/_+/g, "_")
				.replace(/^_|_$/g, "")}`;

			const operation: PathItem[string] = {
				operationId,
				tags: [tag],
				responses: {
					"200": { description: "Successful response" },
				},
			};

			if (params.length > 0) {
				operation.parameters = params.map((name) => ({
					name,
					in: "path",
					required: true,
					schema: { type: "string" },
				}));
			}

			paths[apiPath][method] = operation;
		}
	}

	return {
		openapi: "3.0.3",
		info: {
			title: pkg.name || "API",
			version: pkg.version || "0.1.0",
		},
		paths,
	};
}

// Ensure public directory exists
const publicDir = join(process.cwd(), "public");
try {
	readdirSync(publicDir);
} catch {
	const { mkdirSync } = await import("node:fs");
	mkdirSync(publicDir, { recursive: true });
}

const spec = generateSpec();
writeFileSync(OUTPUT, JSON.stringify(spec, null, 2));
console.log(
	`Generated OpenAPI spec: ${Object.keys((spec as { paths: object }).paths).length} paths → public/openapi.json`,
);
	`Generated OpenAPI spec: ${Object.keys((spec as { paths: object }).paths).length} paths → public/openapi.json`,
);
	`Generated OpenAPI spec: ${Object.keys((spec as { paths: object }).paths).length} paths → public/openapi.json`,
);
