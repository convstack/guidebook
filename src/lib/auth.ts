export interface RequestUser {
	id: string;
	role: string;
	email: string;
}

export function getRequestUser(request: Request): RequestUser | null {
	const id = request.headers.get("x-user-id");
	const role = request.headers.get("x-user-role") || "user";
	const email = request.headers.get("x-user-email") || "";
	if (!id) return null;
	return { id, role, email };
}

export function requireStaff(user: RequestUser | null): Response | null {
	if (!user) {
		return new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		});
	}
	if (user.role !== "staff" && user.role !== "admin") {
		return new Response(JSON.stringify({ error: "Staff access required" }), {
			status: 403,
			headers: { "Content-Type": "application/json" },
		});
	}
	return null;
}
