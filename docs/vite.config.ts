import { defineConfig, Plugin, Connect } from "vite";
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
	plugins: [
		preact({
			exclude: /\breact/,
		}),
		multiSpa(["index.html", "demos/**/*.html"]),
		unsetPreactAliases(),
	],
	build: {
		polyfillModulePreload: false,
		cssCodeSplit: false,
		rollupOptions: {
			output: {
				entryFileNames(chunk) {
					let name = chunk.name;
					if (chunk.facadeModuleId) {
						const p = posix.normalize(chunk.facadeModuleId);
						const m = p.match(/([^/]+)(?:\/index)?\.[^/]+$/);
						if (m) name = m[1];
					}
					return `${name}-[hash].js`;
				},
			},
		},
	},
	resolve: {
		extensions: [".ts", ".tsx", ".js", ".jsx", ".d.ts"],
		alias: env.mode === "production" ? {} : packages(false),
	},
}));

function unsetPreactAliases(): Plugin {
	return {
		name: "remove react aliases",
		config(config) {
			const aliases = config.resolve!.alias!;
			["react", "react-dom", "react-dom/test-utils"].forEach(pkg => {
				// @ts-ignore-next-line
				delete aliases[pkg];
			});
		},
	};
}

// Vite plugin to serve and build multiple SPA roots (index.html dirs)
import glob from "tiny-glob";
function multiSpa(entries: string | string[]): Plugin {
	let htmlEntries: string[];
	let htmlUrls: string[];

	const middleware: Connect.NextHandleFunction = (req, res, next) => {
		const url = req.url!;
		// ignore /@x and file extension URLs:
		if (/(^\/@|\.[a-z]+(?:\?.*)?$)/i.test(url)) return next();
		// match the longest index.html parent path:
		for (let html of htmlUrls) {
			if (!html.endsWith("/index.html")) continue;
			if (!url.startsWith(html.slice(0, -10))) continue;
			req.url = html;
			break;
		}
		next();
	};

	return {
		name: "multi-spa",
		async config() {
			let e = await Promise.all([entries].flat().map(x => glob(x)));
			htmlEntries = Array.from(new Set(e.flat()));
			// sort by length, longest to shortest:
			htmlUrls = htmlEntries
				.map(x => "/" + x)
				.sort((a, b) => b.length - a.length);
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
