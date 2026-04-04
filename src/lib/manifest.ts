import type { UIManifest } from "./types";

export const GUIDEBOOK_MANIFEST: UIManifest = {
	name: "Guidebook",
	icon: "book-open",
	version: "1.0.0",
	navigation: [{ label: "Guidebook", path: "/", icon: "book-open" }],
	sidebar: {
		items: [
			{ label: "All Pages", path: "/", icon: "file-text" },
			{ label: "New Page", path: "/new", icon: "plus" },
		],
	},
	widgets: [],
	pages: [
		{
			path: "/",
			title: "Guidebook",
			layout: "default",
			sections: [
				{
					type: "data-table",
					endpoint: "/api/pages",
					config: {
						rowLink: "/pages/:slug",
						createLink: "/new",
						createLabel: "New Page",
					},
				},
			],
		},
		{
			path: "/pages/:slug",
			title: "Page",
			layout: "full-width",
			showBack: true,
			sections: [
				{
					type: "markdown",
					endpoint: "/api/pages/:slug",
					config: {},
				},
			],
		},
		{
			path: "/pages/:slug/edit",
			title: "Edit Page",
			layout: "full-width",
			showBack: true,
			sections: [
				{
					type: "markdown-editor",
					endpoint: "/api/pages/:slug",
					config: {
						contentField: "content",
						titleField: "title",
						submitLabel: "Save Changes",
						method: "PUT",
					},
				},
			],
		},
		{
			path: "/new",
			title: "New Page",
			layout: "full-width",
			showBack: true,
			sections: [
				{
					type: "markdown-editor",
					endpoint: "/api/pages",
					config: {
						contentField: "content",
						titleField: "title",
						submitLabel: "Create Page",
						method: "POST",
					},
				},
			],
		},
		{
			path: "/pages/:slug/history",
			title: "Page History",
			layout: "default",
			showBack: true,
			sections: [
				{
					type: "data-table",
					endpoint: "/api/pages/:slug/history",
					config: {
						title: "Revision History",
						rowLink: "/pages/:slug/revisions/:id",
						readOnly: true,
					},
				},
			],
		},
		{
			path: "/pages/:slug/revisions/:revisionId",
			title: "Revision",
			layout: "full-width",
			showBack: true,
			sections: [
				{
					type: "markdown",
					endpoint: "/api/pages/:slug/revisions/:revisionId",
					config: {},
				},
			],
		},
	],
	permissions: [],
};
