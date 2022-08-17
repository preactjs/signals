import { defineConfig, Plugin } from "vite";
import preact from "@preact/preset-vite";
import { resolve } from "path";
import fs from "fs";

// Automatically set up aliases for monorepo packages.
// Uses built packages in prod, "source" field in dev.
function packages(prod: boolean) {
	const alias: Record<string, string> = {};
	const root = resolve(__dirname, "../packages");
	for (let name of fs.readdirSync(root)) {
		if (name[0] === ".") continue;
		const p = resolve(root, name, "package.json");
		const pkg = JSON.parse(fs.readFileSync(p, "utf-8"));
		if (pkg.private) continue;
		const entry = prod ? "." : pkg.source;
		alias[pkg.name] = resolve(root, name, entry);
	}
	return alias;
}

export default defineConfig(env => ({
	plugins: [preact(), multiSpa(["index.html", "demos/*.html"])],
	build: {
		polyfillModulePreload: false,
	},
	resolve: {
		extensions: [".ts", ".tsx", ".js", ".jsx", ".d.ts"],
		alias: packages(env.mode === "production"),
	},
}));

// Vite plugin to serve and build multiple SPA roots (index.html dirs)
import glob from "tiny-glob";
function multiSpa(entries: string | string[]): Plugin {
	let htmlEntries: string[];
	let htmlUrls: string[];
	function middleware(req, res, next) {
		const url = req.url!;
		// ignore /@x and file extension URLs:
		if (/(^\/@|\.[a-z]+(?:\?.*)?$)/i.test(url)) return next();
		// match the longest index.html parent path:
		let spa = "";
		for (let html of htmlUrls) {
			if (!html.endsWith("/index.html")) continue;
			if (!url.startsWith(html.slice(0, -10))) continue;
			if (html.length > spa.length) {
				req.url = spa = html;
			}
		}
		next();
	}
	return {
		name: "multi-spa",
		async config() {
			let e = await Promise.all([entries].flat().map(x => glob(x)));
			htmlEntries = Array.from(new Set(e.flat()));
			htmlUrls = htmlEntries.map(x => "/" + x);
		},
		buildStart(options) {
			options.input = htmlEntries;
		},
		configurePreviewServer(server) {
			server.middlewares.use(middleware);
		},
		configureServer(server) {
			server.middlewares.use(middleware);
		},
	};
}
