import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { UIManifest } from "./types";

const { version } = JSON.parse(
	readFileSync(join(process.cwd(), "package.json"), "utf-8"),
);

export const GUIDEBOOK_MANIFEST: UIManifest = {
	name: "Guidebook",
	icon: "book-open",
	version,
	navigation: [{ label: "Guidebook", path: "/", icon: "book-open" }],
	sidebar: {
		items: [
			{ label: "Main Page", path: "/", icon: "home" },
			{ label: "Search", path: "/search", icon: "search" },
			{ label: "New Page", path: "/new", icon: "plus" },
		],
		tree: {
			endpoint: "/api/sidebar-tree",
		},
		footerItems: [{ label: "All Pages", path: "/pages", icon: "list" }],
	},
	widgets: [],
	pages: [
		{
			path: "/",
			title: "Guidebook",
			layout: "full-width",
			sections: [
				{
					type: "markdown",
					endpoint: "/api/pages/main-page",
					config: {},
				},
			],
		},
		{
			path: "/search",
			title: "Search",
			layout: "default",
			showBack: true,
			sections: [
				{
					type: "search",
					endpoint: "/api/search",
					config: {
						rowLink: "/pages/:slug",
					},
				},
			],
		},
		{
			path: "/pages",
			title: "All Pages",
			layout: "default",
			showBack: true,
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
