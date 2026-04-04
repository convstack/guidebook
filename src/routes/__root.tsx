import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import appCss from "~/styles/app.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ name: "description", content: "Guidebook Wiki" },
		],
		links: [
			{ rel: "stylesheet", href: appCss },
			{ rel: "icon", href: "/favicon.ico" },
		],
	}),
	component: RootComponent,
	notFoundComponent: () => (
		<div className="flex min-h-screen items-center justify-center">
			<div className="space-y-2 text-center">
				<h1 className="text-2xl font-bold">404</h1>
				<p className="text-sm">Page not found.</p>
			</div>
		</div>
	),
});

function RootComponent() {
	return (
		<html lang="en">
			<head>
				<HeadContent />
				<title>Guidebook</title>
			</head>
			<body className="min-h-screen bg-[var(--background)] text-[var(--foreground)] antialiased">
				<Outlet />
				<Scripts />
			</body>
		</html>
	);
}
