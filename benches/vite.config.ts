import { defineConfig, Plugin } from "vite";
import { resolve, posix } from "path";
import fs from "fs";
import { NextHandleFunction } from "connect";
import * as express from "express";

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
		indexPlugin(),
		multiSpa(["index.html", "results.html", "cases/**/*.html"]),
	],
	build: {
		polyfillModulePreload: false,
		cssCodeSplit: false,
	},
	resolve: {
		extensions: [".ts", ".tsx", ".js", ".jsx", ".d.ts"],
		alias: env.mode === "production" ? {} : packages(false),
	},
}));

export interface BenchResult {
	url: string;
	time: number;
	memory: number;
}

function escapeHtml(unsafe: string) {
	return unsafe
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

function indexPlugin(): Plugin {
	const results = new Map<string, BenchResult>();

	return {
		name: "index-plugin",
		configureServer(server) {
			server.middlewares.use(express.json());
			server.middlewares.use(async (req, res, next) => {
				if (req.url === "/results") {
					if (req.method === "GET") {
						const cases = await getBenchCases("cases/**/*.html");
						cases.htmlUrls.forEach(url => {
							if (!results.has(url)) {
								results.set(url, { url, time: 0, memory: 0 });
							}
						});

						const items = Array.from(results.entries())
							.sort((a, b) => a[0].localeCompare(b[0]))
							.map(entry => {
								return `<tr>
								<td><a href="${encodeURI(entry[0])}">${escapeHtml(entry[0])}</a></td>
								<td>${entry[1].time.toFixed(2)}ms</td>
								<td>${entry[1].memory}MB</td>
							</tr>`;
							})
							.join("\n");

						const html = fs
							.readFileSync(resolve(__dirname, "results.html"), "utf-8")
							.replace("{%ITEMS%}", items);
						res.end(html);
						return;
					} else if (req.method === "POST") {
						// @ts-ignore
						const { test, duration, memory } = req.body;
						if (
							typeof test !== "string" ||
							typeof duration !== "number" ||
							typeof memory !== "number"
						) {
							throw new Error("Invalid data");
						}
						results.set(test, { url: test, time: duration, memory });
						res.end();
						return;
					}
				}

				next();
			});
		},
		async transformIndexHtml(html, data) {
			if (data.path === "/index.html") {
				const cases = await getBenchCases("cases/**/*.html");
				return html.replace(
					"{%LIST%}",
					cases.htmlEntries.length > 0
						? cases.htmlUrls
								.map(
									url =>
										`<li><a href="${encodeURI(url)}">${escapeHtml(
											url
										)}</a></li>`
								)
								.join("\n")
						: ""
				);
			}

			const name = posix.basename(posix.dirname(data.path));
			return html.replace("{%TITLE%}", name).replace("{%NAME%}", name);
		},
	};
}

// Vite plugin to serve and build multiple SPA roots (index.html dirs)
import glob from "tiny-glob";

async function getBenchCases(entries: string | string[]) {
	let e = await Promise.all([entries].flat().map(x => glob(x)));
	const htmlEntries = Array.from(new Set(e.flat()));
	// sort by length, longest to shortest:
	const htmlUrls = htmlEntries
		.map(x => "/" + x)
		.sort((a, b) => b.length - a.length);
	return { htmlEntries, htmlUrls };
}

function multiSpa(entries: string | string[]): Plugin {
	let htmlEntries: string[];
	let htmlUrls: string[];

	const middleware: NextHandleFunction = (req, res, next) => {
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
			const cases = await getBenchCases(entries);
			htmlEntries = cases.htmlEntries;
			htmlUrls = cases.htmlUrls;
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
