import { GUIDEBOOK_MANIFEST } from "~/lib/manifest";

export async function registerGuidebook() {
	const LANYARD_URL = process.env.LANYARD_URL || "http://localhost:3000";
	const SERVICE_KEY = process.env.LANYARD_SERVICE_KEY;

	if (!SERVICE_KEY) {
		console.warn("LANYARD_SERVICE_KEY not set — skipping registration");
		return;
	}

	try {
		const response = await fetch(`${LANYARD_URL}/api/services/heartbeat`, {
			method: "POST",
			headers: {
				Authorization: `ServiceKey ${SERVICE_KEY}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				status: "healthy",
				uiManifest: GUIDEBOOK_MANIFEST,
			}),
		});

		if (response.ok) {
			console.log("Guidebook registered with Lanyard");
		} else {
			const text = await response.text();
			console.warn(`Registration failed (${response.status}): ${text}`);
		}
	} catch (error) {
		console.warn("Failed to register with Lanyard:", error);
	}
}
