import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	server: {
		port: 5000,
	},
	resolve: {
		tsconfigPaths: true,
	},
	plugins: [
		// Generate OpenAPI spec on dev startup
		{
			name: "guidebook-openapi",
			buildStart() {
				import("node:child_process").then(({ execSync }) => {
					try {
						execSync("bun run openapi:generate", { stdio: "inherit" });
					} catch {
						console.warn("Failed to generate OpenAPI spec");
					}
				});
			},
		},
		tailwindcss(),
		tanstackStart({
			srcDirectory: "src",
		}),
		viteReact(),
		{
			name: "guidebook-dev-init",
			configureServer(server) {
				server.httpServer?.once("listening", async () => {
					try {
						const mod = await server.ssrLoadModule("~/server/services/self-register");
						await mod.registerGuidebook();
					} catch (err) {
						console.warn("Failed to self-register in dev:", err);
					}
				});
			},
		},
	],
});
