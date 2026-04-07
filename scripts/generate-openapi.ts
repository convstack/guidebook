/**
 * Scans src/routes/api/ for TanStack Router handler files, parses
 * @openapi JSDoc annotations, and generates a full OpenAPI 3.0 spec.
 *
 * Annotation format (above each handler method):
 *
 *   /** @openapi
 *    * summary: Create a new page
 *    * auth: staff
 *    * body:
 *    *   title: string (required) - Page title
 *    *   content: string - Markdown content
 *    * query:
 *    *   q: string (required) - Search query
 *    * response: 201
 *    *   success: boolean
 *    *   redirect: string
 *    * error: 400 Validation error
 *    * error: 401 Unauthorized
 *    *\/
 *
 * Usage: bun run scripts/generate-openapi.ts
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROUTES_DIR = join(process.cwd(), "src", "routes", "api");
const OUTPUT = join(process.cwd(), "public", "openapi.json");
const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;

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
	if (rel.endsWith("/index")) rel = rel.slice(0, -6);
	rel = rel.replace(/\$([a-zA-Z]+)/g, "{$1}");
	return `/api/${rel}`;
}

function extractParams(apiPath: string): string[] {
	const matches = apiPath.match(/\{(\w+)\}/g);
	return matches ? matches.map((m) => m.slice(1, -1)) : [];
}

function deriveTag(apiPath: string): string {
	const parts = apiPath.replace("/api/", "").split("/");
	if (parts[0] === "my") return `my/${parts[1] || ""}`.replace(/\/$/, "");
	if (parts[0] === "webhooks") return "webhooks";
	if (parts[0] === "upload") return "upload";
	return parts[0] || "general";
}

interface ParsedAnnotation {
	summary?: string;
	description?: string;
	auth?: string;
	body: Record<
		string,
		{ type: string; required: boolean; description: string }
	>;
	query: Record<
		string,
		{ type: string; required: boolean; description: string }
	>;
	response: { status: number; fields: Record<string, string> };
	errors: Array<{ status: number; description: string }>;
	contentType?: string;
}

function parseAnnotations(content: string): Map<string, ParsedAnnotation> {
	const results = new Map<string, ParsedAnnotation>();

	// Find all @openapi blocks followed by a method handler
	const pattern = /\/\*\*\s*@openapi\b([\s\S]*?)\*\/\s*(\w+)\s*:/g;
	let match: RegExpExecArray | null;
	match = pattern.exec(content);
	while (match) {
		const block = match[1];
		const method = match[2].toLowerCase();

		const annotation: ParsedAnnotation = {
			body: {},
			query: {},
			response: { status: 200, fields: {} },
			errors: [],
		};

		const lines = block
			.split("\n")
			.map((l) => l.replace(/^\s*\*\s?/, "").trim())
			.filter(Boolean);

		let section: "root" | "body" | "query" | "response" = "root";

		for (const line of lines) {
			if (line.startsWith("summary:")) {
				annotation.summary = line.slice(8).trim();
				section = "root";
			} else if (line.startsWith("description:")) {
				annotation.description = line.slice(12).trim();
				section = "root";
			} else if (line.startsWith("auth:")) {
				annotation.auth = line.slice(5).trim();
				section = "root";
			} else if (line.startsWith("contentType:")) {
				annotation.contentType = line.slice(12).trim();
				section = "root";
			} else if (line.startsWith("body:")) {
				section = "body";
			} else if (line.startsWith("query:")) {
				section = "query";
			} else if (line.startsWith("response:")) {
				const statusStr = line.slice(9).trim();
				if (statusStr)
					annotation.response.status = Number.parseInt(statusStr, 10);
				section = "response";
			} else if (line.startsWith("error:")) {
				const rest = line.slice(6).trim();
				const spaceIdx = rest.indexOf(" ");
				const status = Number.parseInt(
					rest.slice(0, spaceIdx > 0 ? spaceIdx : undefined),
					10,
				);
				const desc = spaceIdx > 0 ? rest.slice(spaceIdx + 1) : "";
				annotation.errors.push({ status, description: desc });
			} else if (
				section === "body" ||
				section === "query" ||
				section === "response"
			) {
				// Parse field line: "fieldName: type (required) - description"
				const fieldMatch = line.match(
					/^(\w+):\s*(\S+)(?:\s*\((\w+)\))?\s*(?:-\s*(.*))?$/,
				);
				if (fieldMatch) {
					const [, name, type, modifier, desc] = fieldMatch;
					if (section === "response") {
						annotation.response.fields[name] = type;
					} else {
						annotation[section][name] = {
							type: mapType(type),
							required: modifier === "required",
							description: desc || "",
						};
					}
				}
			}
		}

		results.set(method, annotation);
		match = pattern.exec(content);
	}

	return results;
}

function mapType(t: string): string {
	switch (t) {
		case "string":
			return "string";
		case "number":
		case "integer":
		case "int":
			return "integer";
		case "boolean":
		case "bool":
			return "boolean";
		case "date-time":
			return "string";
		case "file":
		case "binary":
			return "string";
		case "array":
			return "array";
		default:
			return "string";
	}
}

function mapFormat(t: string): string | undefined {
	if (t === "date-time") return "date-time";
	if (t === "file" || t === "binary") return "binary";
	return undefined;
}

const errorSchema = {
	type: "object" as const,
	properties: { error: { type: "string" as const } },
};

function buildSpec() {
	const pkg = JSON.parse(
		readFileSync(join(process.cwd(), "package.json"), "utf-8"),
	);

	const paths: Record<string, Record<string, unknown>> = {};
	const files = walkDir(ROUTES_DIR);

	for (const file of files) {
		const content = readFileSync(file, "utf-8");
		const apiPath = filePathToApiPath(file);
		const pathParams = extractParams(apiPath);
		const tag = deriveTag(apiPath);
		const annotations = parseAnnotations(content);

		// Also detect unannotated methods
		for (const method of METHODS) {
			if (!new RegExp(`${method}\\s*:`).test(content)) continue;
			const m = method.toLowerCase();
			const ann = annotations.get(m);

			const operation: Record<string, unknown> = {
				operationId: `${m}_${apiPath
					.replace(/[/{}-]/g, "_")
					.replace(/_+/g, "_")
					.replace(/^_|_$/g, "")}`,
				tags: [tag],
			};

			if (ann?.summary) operation.summary = ann.summary;
			if (ann?.description) operation.description = ann.description;

			// Parameters
			const parameters: unknown[] = [];
			for (const name of pathParams) {
				parameters.push({
					name,
					in: "path",
					required: true,
					schema: { type: "string" },
				});
			}
			if (ann?.query) {
				for (const [name, field] of Object.entries(ann.query)) {
					parameters.push({
						name,
						in: "query",
						required: field.required,
						schema: { type: field.type },
						...(field.description ? { description: field.description } : {}),
					});
				}
			}
			if (parameters.length > 0) operation.parameters = parameters;

			// Request body
			if (ann?.body && Object.keys(ann.body).length > 0) {
				const contentType = ann.contentType || "application/json";
				const properties: Record<string, unknown> = {};
				const required: string[] = [];

				for (const [name, field] of Object.entries(ann.body)) {
					const prop: Record<string, unknown> = { type: field.type };
					const fmt = mapFormat(field.type);
					if (fmt) prop.format = fmt;
					if (field.description) prop.description = field.description;
					properties[name] = prop;
					if (field.required) required.push(name);
				}

				operation.requestBody = {
					required: true,
					content: {
						[contentType]: {
							schema: {
								type: "object",
								properties,
								...(required.length > 0 ? { required } : {}),
							},
						},
					},
				};
			}

			// Responses
			const responses: Record<string, unknown> = {};
			const status = ann?.response.status || 200;

			if (ann?.response.fields && Object.keys(ann.response.fields).length > 0) {
				const properties: Record<string, unknown> = {};
				for (const [name, type] of Object.entries(ann.response.fields)) {
					const prop: Record<string, unknown> = { type: mapType(type) };
					const fmt = mapFormat(type);
					if (fmt) prop.format = fmt;
					properties[name] = prop;
				}
				responses[String(status)] = {
					description: "Successful response",
					content: {
						"application/json": {
							schema: { type: "object", properties },
						},
					},
				};
			} else {
				responses[String(status)] = { description: "Successful response" };
			}

			if (ann?.errors) {
				for (const err of ann.errors) {
					responses[String(err.status)] = {
						description: err.description || "Error",
						content: {
							"application/json": { schema: errorSchema },
						},
					};
				}
			}

			operation.responses = responses;

			if (!paths[apiPath]) paths[apiPath] = {};
			paths[apiPath][m] = operation;
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

const spec = buildSpec();
writeFileSync(OUTPUT, JSON.stringify(spec, null, 2));
console.log(
	`Generated OpenAPI spec: ${Object.keys(spec.paths).length} paths → public/openapi.json`,
);
