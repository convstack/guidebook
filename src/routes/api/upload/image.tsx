import { createFileRoute } from "@tanstack/react-router";
import { getRequestUser, requireStaff } from "~/lib/auth";
import { isS3Configured, uploadFile } from "~/lib/s3";

const ALLOWED_TYPES = [
	"image/jpeg",
	"image/png",
	"image/gif",
	"image/webp",
	"image/svg+xml",
];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export const Route = createFileRoute("/api/upload/image")({
	server: {
		handlers: {
			/** @openapi
			 * summary: Upload an image for wiki pages
			 * description: Accepts JPEG, PNG, GIF, WebP, SVG up to 5MB.
			 * auth: staff
			 * contentType: multipart/form-data
			 * body:
			 *   file: binary (required) - Image file
			 * response: 200
			 *   url: string
			 * error: 400 Invalid file type or size
			 * error: 401 Unauthorized
			 * error: 403 Staff access required
			 * error: 501 S3 uploads not configured
			 */
			POST: async ({ request }: { request: Request }) => {
				const user = getRequestUser(request);
				if (!user) {
					return new Response(JSON.stringify({ error: "Unauthorized" }), {
						status: 401,
						headers: { "Content-Type": "application/json" },
					});
				}
				const staffError = requireStaff(user);
				if (staffError) return staffError;

				if (!isS3Configured()) {
					return new Response(
						JSON.stringify({ error: "File uploads are not configured" }),
						{ status: 501, headers: { "Content-Type": "application/json" } },
					);
				}

				const formData = await request.formData();
				const file = formData.get("file");

				if (!file || !(file instanceof File)) {
					return new Response(JSON.stringify({ error: "No file provided" }), {
						status: 400,
						headers: { "Content-Type": "application/json" },
					});
				}

				if (!ALLOWED_TYPES.includes(file.type)) {
					return new Response(
						JSON.stringify({
							error: "Invalid file type. Allowed: JPEG, PNG, GIF, WebP, SVG",
						}),
						{ status: 400, headers: { "Content-Type": "application/json" } },
					);
				}

				if (file.size > MAX_SIZE) {
					return new Response(
						JSON.stringify({ error: "File too large. Maximum 5MB" }),
						{ status: 400, headers: { "Content-Type": "application/json" } },
					);
				}

				const ext = `.${file.name.split(".").pop() || "jpg"}`;
				const buffer = new Uint8Array(await file.arrayBuffer());

				const url = await uploadFile(buffer, {
					folder: "guidebook/images",
					contentType: file.type,
					extension: ext,
				});

				if (!url) {
					return new Response(JSON.stringify({ error: "Upload failed" }), {
						status: 500,
						headers: { "Content-Type": "application/json" },
					});
				}

				return new Response(JSON.stringify({ url }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			},
		},
	},
});
