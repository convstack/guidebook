import { createHandler } from "@convstack/service-sdk/handlers";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/health")({
	server: {
		handlers: {
			/** @openapi
			 * summary: Health check
			 * response: 200
			 *   status: string
			 */
			GET: createHandler({
				handler: async () => ({ status: "ok" }),
			}),
		},
	},
});
