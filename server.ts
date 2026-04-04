import { join } from "node:path";
import app from "./dist/server/server.js";

const DIST_CLIENT = join(import.meta.dir, "dist", "client");

const MIME_TYPES: Record<string, string> = {
	".js": "application/javascript",
	".css": "text/css",
	".html": "text/html",
	".json": "application/json",
	".png": "image/png",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
};

function getMimeType(path: string): string {
	const ext = path.slice(path.lastIndexOf("."));
	return MIME_TYPES[ext] || "application/octet-stream";
}

const port = Number(process.env.PORT) || 5000;

Bun.serve({
	port,
	async fetch(request) {
		const url = new URL(request.url);
		if (url.pathname.startsWith("/assets/")) {
			const filePath = join(DIST_CLIENT, url.pathname);
			const file = Bun.file(filePath);
			if (await file.exists()) {
				return new Response(file, {
					headers: {
						"Content-Type": getMimeType(url.pathname),
						"Cache-Control": "public, max-age=31536000, immutable",
					},
				});
			}
		}
		return app.fetch(request);
	},
});

console.log(`Guidebook server listening on http://localhost:${port}`);

import("./src/server/services/self-register.ts")
	.then(({ registerGuidebook }) => registerGuidebook())
	.catch((err) => console.warn("Failed to register:", err));
