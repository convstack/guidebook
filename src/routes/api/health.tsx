import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/health")({
	server: {
		handlers: {
			/** @openapi
			 * summary: Health check
			 * response: 200
			 *   status: string
			 */
			GET: async () => {
				return new Response(JSON.stringify({ status: "ok" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			},
		},
	},
});
