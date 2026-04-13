import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { openApiPlugin } from "@convstack/service-sdk/vite-plugins";
import { defineServiceConfig } from "@convstack/service-sdk/vite";
import { defineConfig } from "vite";

export default defineConfig(
	defineServiceConfig({
		slug: "guidebook",
		port: 5000,
		plugins: [
			openApiPlugin("guidebook"),
			tailwindcss(),
			tanstackStart({ srcDirectory: "src" }),
			viteReact(),
		],
	}),
);
