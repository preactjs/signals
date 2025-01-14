/*eslint no-var:0, object-shorthand:0 */

var coverage = String(process.env.COVERAGE) === "true",
	minify = String(process.env.MINIFY) === "true",
	ci = String(process.env.CI).match(/^(1|true)$/gi),
	sauceLabs = ci && String(process.env.RUN_SAUCE_LABS) === "true",
	// always downlevel to ES5 for saucelabs:
	downlevel = sauceLabs || String(process.env.DOWNLEVEL) === "true",
	path = require("path"),
	errorstacks = require("errorstacks"),
	kl = require("kolorist");

const babel = require("@babel/core");
const fs = require("fs").promises;

var localLaunchers = {
	ChromeNoSandboxHeadless: {
		base: "Chrome",
		flags: [
			"--no-sandbox",
			"--disable-setuid-sandbox",
			// See https://chromium.googlesource.com/chromium/src/+/lkgr/headless/README.md
			"--headless",
			"--disable-gpu",
			"--no-gpu",
			// Without a remote debugging port, Google Chrome exits immediately.
			"--remote-debugging-port=9333",
			"--js-flags=--expose-gc",
		],
	},
};

const subPkgPath = pkgName => {
	if (!minify) {
		return path.join(__dirname, pkgName, "src", "index.ts");
	}

	// Resolve from package.exports field
	const pkgJson = path.join(__dirname, pkgName, "package.json");
	const pkgExports = require(pkgJson).exports;
	const file = pkgExports["."].browser ?? pkgExports["."].import;
	return path.join(__dirname, pkgName, file);
};

// Esbuild plugin for aliasing + babel pass
function createEsbuildPlugin(filteredPkgList) {
	const pending = new Map();
	const cache = new Map();

	const rename = {};
	const mangle = require("./mangle.json");
	for (let prop in mangle.props.props) {
		let name = prop;
		if (name[0] === "$") {
			name = name.slice(1);
		}

		rename[name] = mangle.props.props[prop];
	}

	const alias = filteredPkgList.reduce((obj, key) => {
		obj[pkgList[key]] = subPkgPath(`./packages/${key}`);
		return obj;
	}, {});

	let signalsTransformPath;
	if (filteredPkgList.includes("react-transform")) {
		signalsTransformPath = require.resolve("./packages/react-transform");
		/* eslint-disable-next-line no-console */
		console.log(
			`Transforming tests using ${signalsTransformPath}.\nManually re-compile & re-run tests to validate changes to react-transform`
		);
	}

	return {
		name: "custom",
		setup(build) {
			// .d.ts resolution
			build.onResolve({ filter: /\/[^.]+$/ }, async args => {
				// only intercept static imports from .ts files:
				if (args.kind !== "import-statement") return;
				if (!/\.tsx?/.test(args.importer)) return;
				const abs = path.resolve(args.resolveDir, args.path + ".d.ts");
				try {
					await fs.access(abs);
					return { path: abs };
				} catch (e) {
					// not a .d.ts import
				}
			});

			// Aliasing: If "MINIFY" is set to "true" we use the dist/
			// files instead of those from src/
			build.onResolve({ filter: /^@preact\/.*/ }, args => {
				const pkg = alias[args.path];
				return {
					path: pkg,
				};
			});

			// Mock fs module to run babel in a browser environment
			build.onResolve({ filter: /^fs$/ }, () => {
				return { path: path.join(__dirname, "test/browser/mockFs.js") };
			});

			// Apply babel pass whenever we load a TS or JS file
			build.onLoad({ filter: /\.[mc]?[jt]sx?$/ }, async args => {
				// But skip any file from node_modules if we aren't down-leveling
				if (!downlevel && args.path.includes("node_modules")) return;

				const contents = await fs.readFile(args.path, "utf-8");

				// Using a cache is crucial as babel is 30x slower than esbuild
				const cached = cache.get(args.path);
				if (cached && cached.input === contents) {
					return {
						contents: cached.result,
						resolveDir: path.dirname(args.path),
						loader: "js",
					};
				}

				let result = contents;

				// Check if somebody already requested the current file. If they
				// did than we push a listener instead of doing a duplicate
				// transform of the same file. This is crucial for build perf.
				if (!pending.has(args.path)) {
					pending.set(args.path, []);

					const jsx = [
						"@babel/preset-react",
						{
							runtime: "classic",
							pragma: "createElement",
							pragmaFrag: "Fragment",
						},
					];

					const ts = [
						"@babel/preset-typescript",
						{
							jsxPragma: "createElement",
							jsxPragmaFrag: "Fragment",
						},
					];

					const renamePlugin = [
						"babel-plugin-transform-rename-properties",
						{
							rename,
						},
					];

					/** @type {any} */
					let signalsTransform = false;
					if (
						args.path.includes("packages/react/test/shared") ||
						args.path.includes("packages/react/runtime/test")
					) {
						signalsTransform = [
							signalsTransformPath,
							{
								mode: "auto",
							},
						];
					}

					const downlevelPlugin = [
						"@babel/preset-env",
						{
							loose: true,
							modules: false,
							targets: {
								browsers: ["last 2 versions", "IE >= 11"],
							},
						},
					];

					const coveragePlugin = [
						"istanbul",
						{
							include: minify ? "**/dist/**/*.js" : "**/src/**/*.{ts,js}",
						},
					];

					const tmp = await babel.transformAsync(result, {
						filename: args.path,
						sourceMaps: "inline",
						presets: downlevel ? [ts, jsx, downlevelPlugin] : [ts, jsx],
						plugins: [
							signalsTransform,
							coverage && coveragePlugin,
							minify && renamePlugin,
						].filter(Boolean),
					});
					result = (tmp && tmp.code) || result;
					cache.set(args.path, { input: contents, result });

					// Fire all pending listeners that are waiting on the same
					// file transformation
					const waited = pending.get(args.path);
					pending.delete(args.path);
					waited.forEach(fn => fn());
				} else {
					// Subscribe to the existing transformation completion call
					await new Promise(r => {
						pending.get(args.path).push(r);
					});
					result = cache.get(args.path).result;
				}

				return {
					contents: result,
					resolveDir: path.dirname(args.path),
					loader: "js",
				};
			});
		},
	};
}

const pkgList = {
	core: "@preact/signals-core",
	preact: "@preact/signals",
	react: "@preact/signals-react",
	"react/runtime": "@preact/signals-react/runtime",
	"react-transform": "@preact/signals-react-transform",
};

module.exports = function (config) {
	let filteredPkgList = Object.keys(pkgList),
		filteredPkgPattern = `{${Object.keys(pkgList).join(",")}}`;

	// Doesn't quite adhere to Karma's `--grep` flag, but should be good enough to filter by package.
	// E.g., `--grep=preact,core`
	if (config.grep) {
		filteredPkgList = config.grep.split(",");
		filteredPkgPattern = filteredPkgList[1]
			? `{${filteredPkgList.join(",")}}`
			: filteredPkgList[0];
	}

	config.set({
		browsers: Object.keys(localLaunchers),

		frameworks: ["mocha", "chai-sinon"],

		reporters: ["mocha"].concat(coverage ? "coverage" : []),

		formatError(msg) {
			let stack = msg;
			// Karma prints error twice if it's an infinite loop
			if (/^\s*Uncaught/.test(msg)) {
				const lines = msg.split(/\n/g);
				const emptyIdx = lines.findIndex(line => /^\s*$/.test(line));
				stack = lines.slice(emptyIdx).join("\n");
			}

			const frames = errorstacks.parseStackTrace(stack);
			if (!frames.length || frames[0].column === -1) return "\n" + msg + "\n";

			let out = "";
			for (let i = 0; i < frames.length; i++) {
				const frame = frames[i];
				const filePath = kl.lightCyan(
					frame.fileName.replace(__dirname + "/", "")
				);

				const indentMatch = msg.match(/^(\s*)/);
				const indent = indentMatch ? indentMatch[1] : "  ";
				const location = kl.yellow(`:${frame.line}:${frame.column}`);

				out += `${indent}at ${frame.name} (${filePath}${location})\n`;
			}

			return out;
		},

		coverageReporter: {
			dir: path.join(__dirname, "coverage"),
			reporters: [
				{ type: "text-summary" },
				{ type: "html" },
				{ type: "lcovonly", subdir: ".", file: "lcov.info" },
			],
		},

		mochaReporter: {
			showDiff: true,
		},

		browserLogOptions: { terminal: true },
		browserConsoleLogOptions: { terminal: true },

		browserNoActivityTimeout: 5 * 60 * 1000,

		// Use only two browsers concurrently, works better with open source Sauce Labs remote testing
		concurrency: 2,

		captureTimeout: 0,

		customLaunchers: localLaunchers,

		files: [
			...(filteredPkgList.some(i => /^react/.test(i))
				? [
						{
							// Provide some NodeJS globals to run babel in a browser environment
							pattern: "test/browser/nodeGlobals.js",
							watched: false,
							type: "js",
						},
						{
							pattern: "test/browser/babel.js",
							watched: false,
							type: "js",
						},
				  ]
				: []),
			{
				pattern:
					process.env.TESTS ||
					`packages/${filteredPkgPattern}/test/{,browser,shared}/*.test.tsx`,
				watched: false,
				type: "js",
			},
		],

		mime: {
			"text/javascript": ["js", "jsx"],
		},

		preprocessors: {
			[`packages/${filteredPkgPattern}/test/**/*`]: ["esbuild"],
			[`test/browser/babel.js`]: ["esbuild"],
			[`test/browser/nodeGlobals.js`]: ["esbuild"],
		},

		plugins: [
			"karma-esbuild",
			"karma-chrome-launcher",
			"karma-mocha",
			"karma-mocha-reporter",
			"karma-chai-sinon",
			"karma-coverage",
		],

		esbuild: {
			// karma-esbuild options
			singleBundle: false,
			jsx: "preserve",

			// esbuild options
			target: downlevel ? "es5" : "es2015",
			define: {
				COVERAGE: coverage,
				"process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || ""),
			},
			plugins: [createEsbuildPlugin(filteredPkgList)],
		},
	});
};
