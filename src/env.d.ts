declare module "*/server.js" {
	const app: { fetch: (request: Request) => Response | Promise<Response> };
	export default app;
}
