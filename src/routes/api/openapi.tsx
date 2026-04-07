import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createFileRoute } from "@tanstack/react-router";

let cachedSpec: string | null = null;

function getSpec(): string {
	if (cachedSpec) return cachedSpec;
	try {
		cachedSpec = readFileSync(
			join(process.cwd(), "public", "openapi.json"),
			"utf-8",
		);
	} catch {
		cachedSpec = JSON.stringify({
			openapi: "3.0.3",
			info: { title: "API", version: "0.1.0" },
			paths: {},
		});
	}
	return cachedSpec;
}

export const Route = createFileRoute("/api/openapi")({
	server: {
		handlers: {
			GET: async () => {
				return new Response(getSpec(), {
					status: 200,
					headers: {
						"Content-Type": "application/json",
						"Access-Control-Allow-Origin": "*",
					},
				});
			},
		},
	},
});
