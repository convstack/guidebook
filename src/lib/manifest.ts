import {
	dataTable,
	defineManifest,
	form,
	item,
	markdown,
	markdownEditor,
	page,
	searchSection,
	sidebar,
	timeline,
} from "@convstack/service-sdk/manifest";

export const GUIDEBOOK_MANIFEST = defineManifest({
	name: "Guidebook",
	slug: "guidebook",
	icon: "book-open",
	accent: "#8b5cf6",
	navigation: [{ label: "Guidebook", path: "/", icon: "book-open" }],
	sidebar: sidebar({
		items: [
			item("Main Page", "/", { icon: "home" }),
			item("Search", "/search", { icon: "search" }),
		],
		primaryAction: { label: "New Page", icon: "plus", link: "/new" },
		tree: { endpoint: "/api/sidebar-tree" },
		footerItems: [item("All Pages", "/pages", { icon: "list" })],
	}),
	pages: [
		page(
			"/",
			"Guidebook",
			{ layout: "reading" },
			// Matches /pages/:slug — both render a wiki markdown page so they
			// should share the same comfortable reading column width.
			[markdown("/api/pages/main-page")],
		),
		page("/search", "Search", { layout: "default", showBack: true }, [
			searchSection("/api/search", { rowLink: "/pages/:slug" }),
		]),
		page("/pages", "All Pages", { layout: "default", showBack: true }, [
			dataTable("/api/pages", {
				rowLink: "/pages/:slug",
				createLink: "/new",
				createLabel: "New Page",
			}),
		]),
		page("/pages/:slug", "Page", { layout: "reading", showBack: true }, [
			markdown("/api/pages/:slug"),
		]),
		page("/pages/:slug/edit", "Edit Page", { layout: "full", showBack: true }, [
			markdownEditor("/api/pages/:slug", {
				contentField: "content",
				titleField: "title",
				submitLabel: "Save Changes",
				method: "PUT",
			}),
		]),
		page("/new", "New Page", { layout: "full", showBack: true }, [
			markdownEditor("/api/pages", {
				contentField: "content",
				titleField: "title",
				submitLabel: "Create Page",
				method: "POST",
			}),
		]),
		page(
			"/pages/:slug/history",
			"Page History",
			{ layout: "default", showBack: true },
			[timeline("/api/pages/:slug/history", { title: "Revision History" })],
		),
		page(
			"/pages/:slug/revisions/:revisionId",
			"Revision",
			// Same as /pages/:slug — markdown content reads better at 720 px.
			{ layout: "reading", showBack: true },
			[markdown("/api/pages/:slug/revisions/:revisionId")],
		),
		page(
			"/pages/:slug/permissions",
			"Page Permissions",
			{ layout: "default", showBack: true },
			[
				dataTable("/api/pages/:slug/permissions", {
					title: "Permission Entries",
				}),
				form("/api/pages/:slug/permissions/new", {
					// Fields are populated dynamically by the endpoint at render time.
					fields: [],
					title: "Add Permission",
					submitEndpoint: "/api/pages/:slug/permissions",
					submitLabel: "Add",
					method: "POST",
				}),
			],
		),
	],
	permissions: [
		"guidebook:pages:read",
		"guidebook:pages:write",
		"guidebook:admin",
	],
});
