import type * as Handlers from "@convstack/service-sdk/handlers";

type Principal =
	| {
			kind: "user";
			user: {
				id: string;
				name: string;
				email: string;
				permissions: string[];
				orgRoles: Array<{ orgId: string; slug: string; role: string }>;
			};
	  }
	| { kind: "service"; caller: { slug: string; scope: string[] } };

const state: { principal: Principal | null } = { principal: null };

export function asUser(id: string, permissions: string[] = []) {
	state.principal = {
		kind: "user",
		user: {
			id,
			name: id,
			email: `${id}@x.test`,
			permissions,
			orgRoles: [],
		},
	};
}

export function asService(slug: string) {
	state.principal = { kind: "service", caller: { slug, scope: [] } };
}

export function asNobody() {
	state.principal = null;
}

// createHandler as the SDK ships it, minus the proof check: the caller comes from state
export function withStubbedProof(real: typeof Handlers): typeof Handlers {
	const createHandler = ((options: Parameters<typeof real.createHandler>[0]) =>
		async ({
			request,
			params,
		}: {
			request: Request;
			params?: Record<string, string>;
		}) => {
			try {
				if (!options.skipAuth && !state.principal) {
					throw new real.ServiceError(401, "UNAUTHORIZED", "Unauthorized");
				}
				const ctx = real.buildHandlerContext(
					request,
					options.db,
					state.principal,
				);
				const query = Object.fromEntries(
					new URL(request.url).searchParams.entries(),
				);
				let body: Record<string, unknown> = {};
				if (
					request.method !== "GET" &&
					request.method !== "HEAD" &&
					request.headers.get("content-type")?.includes("json")
				) {
					const text = await request.text();
					if (text) {
						let parsed: unknown;
						try {
							parsed = JSON.parse(text);
						} catch {
							throw real.httpError.badRequest("Request body is not valid JSON");
						}
						if (
							typeof parsed !== "object" ||
							parsed === null ||
							Array.isArray(parsed)
						) {
							throw real.httpError.badRequest(
								"Request body must be a JSON object",
							);
						}
						body = parsed as Record<string, unknown>;
					}
				}
				// the path wins over the body, the body over the query
				const raw = { ...query, ...body, ...params };
				const result = await options.handler({
					...ctx,
					input: options.input ? options.input.parse(raw) : raw,
				});
				if (options.output && !options.output.safeParse(result).success) {
					throw new real.ServiceError(
						500,
						"INTERNAL_ERROR",
						"Internal server error",
					);
				}
				return new Response(JSON.stringify(result), { status: 200 });
			} catch (err) {
				return real.errorToResponse(err);
			}
		}) as typeof real.createHandler;
	return { ...real, createHandler };
}
