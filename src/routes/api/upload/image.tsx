import { createFileRoute } from "@tanstack/react-router";
import { requirePermission, requireUser } from "~/lib/auth";
import { checkPageAccess } from "~/lib/page-permissions";
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
			 * description: |
			 *   Accepts JPEG, PNG, GIF, WebP, SVG up to 5MB.
			 *   If pageSlug query param is set, requires write access on that page.
			 *   Otherwise, falls back to service-level guidebook:pages:write.
			 * contentType: multipart/form-data
			 * query:
			 *   pageSlug: string - Page slug the upload is intended for
			 * body:
			 *   file: binary (required) - Image file
			 * response: 200
			 *   url: string
			 * error: 400 Invalid file type or size
			 * error: 403 Write access required
			 * error: 501 S3 uploads not configured
			 */
			POST: async ({ request }: { request: Request }) => {
				const reqUrl = new URL(request.url);
				const pageSlug = reqUrl.searchParams.get("pageSlug");

				if (pageSlug) {
					const user = await requireUser(request);
					if (user instanceof Response) return user;
					const { db } = await import("~/db");
					const { wikiPage } = await import("~/db/schema");
					const { eq } = await import("drizzle-orm");
					const [page] = await db
						.select({ id: wikiPage.id })
						.from(wikiPage)
						.where(eq(wikiPage.slug, pageSlug))
						.limit(1);
					const access = await checkPageAccess(
						{
							user,
							permissions: user.permissions,
							orgRoles: user.orgRoles,
						},
						pageSlug,
					);
					// a slug with no page would otherwise fall back to the service
					// permission and tell a restricted page apart from a missing one
					if (!page || !access.canWrite) {
						return new Response(
							JSON.stringify({
								error: "Write access to this page is required",
							}),
							{
								status: 403,
								headers: { "Content-Type": "application/json" },
							},
						);
					}
				} else {
					const permErr = await requirePermission(
						request,
						"guidebook:pages:write",
					);
					if (permErr) return permErr;
				}

				if (!isS3Configured()) {
					return new Response(
						JSON.stringify({ error: "File uploads are not configured" }),
						{ status: 501, headers: { "Content-Type": "application/json" } },
					);
				}

				// a request that isn't a form upload at all has no file either
				let file: FormDataEntryValue | null = null;
				try {
					file = (await request.formData()).get("file");
				} catch {
					file = null;
				}

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
