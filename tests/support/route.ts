type Handler = (args: {
	request: Request;
	params?: Record<string, string>;
}) => Promise<Response>;

export function handlers(route: { options: object }): Record<string, Handler> {
	const server = (
		route.options as { server?: { handlers?: Record<string, Handler> } }
	).server;
	if (!server?.handlers || typeof server.handlers === "function") {
		throw new Error("route has no method handlers");
	}
	return server.handlers;
}
