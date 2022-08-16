import { defineConfig, Plugin } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
	plugins: [preact(), multiSpa(["index.html", "demos/*.html"])],
	resolve: {
		alias: {
			"@preact/signals": __dirname + "/../packages/preact/src/index.ts",
			"@preact/signals-core": __dirname + "/../packages/core/src/index.ts",
		},
	},
});

import glob from "tiny-glob";
function multiSpa(entries: string | string[]): Plugin {
	let htmlEntries: string[];
	let htmlUrls: string[];
	return {
		name: "multi-spa",
		async buildStart(options) {
			let e = await Promise.all([entries].flat().map(x => glob(x)));
			htmlEntries = Array.from(new Set(e.flat()));
			htmlUrls = htmlEntries.map(x => "/" + x);
			options.input = htmlEntries;
		},
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
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
			});
		},
	};
}
