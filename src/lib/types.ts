export interface NavigationItem {
	label: string;
	path: string;
	icon: string;
	href?: string;
	badge?: { endpoint: string };
	children?: NavigationItem[];
	requiredPermission?: string;
}

export interface ServiceSidebar {
	items?: NavigationItem[];
	type?: "tree";
	endpoint?: string;
}

export interface UIManifest {
	name: string;
	icon: string;
	version: string;
	navigation: NavigationItem[];
	widgets: unknown[];
	pages: unknown[];
	permissions: string[];
	sidebar?: ServiceSidebar;
}
