// @ts-check
import path from "node:path";
import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { manglePlugin } from "./scripts/manglePlugin.mjs";
import { transformReactTests } from "./scripts/transformReactTests.mjs";

const MINIFY = process.env.MINIFY === "true";
const COVERAGE = process.env.COVERAGE === "true";
const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	resolve: {
		alias: MINIFY
			? {
					"@preact/signals-core": path.join(
						dirname,
						"./packages/core/dist/signals-core.module.js"
					),
					"@preact/signals/utils": path.join(
						dirname,
						"./packages/preact/utils/dist/utils.module.js"
					),
					"@preact/signals": path.join(
						dirname,
						"./packages/preact/dist/signals.module.js"
					),
					"@preact/signals-react/runtime": path.join(
						dirname,
						"./packages/react/runtime/dist/runtime.module.js"
					),
					"@preact/signals-react/utils": path.join(
						dirname,
						"./packages/react/utils/dist/utils.module.js"
					),
					"@preact/signals-react": path.join(
						dirname,
						"./packages/react/dist/signals.module.js"
					),
					"@preact/signals-react-runtime": path.join(
						dirname,
						"./packages/react/runtime/dist/runtime.module.js"
					),
					"@preact/signals-react-utils": path.join(
						dirname,
						"./packages/react/utils/dist/utils.module.js"
					),
					"@preact/signals-react-transform": path.join(
						dirname,
						"./packages/react-transform/dist/signals-transform.mjs"
					),
					"@preact/signals-utils": path.join(
						dirname,
						"./packages/preact/utils/dist/utils.module.js"
					),
				}
			: {},
	},
	plugins: [
		manglePlugin(),
		transformReactTests(),
		{
			name: "react-create-root-legacy-fallback",
			enforce: "pre",
			async resolveId(source, importer) {
				if (!importer?.startsWith(path.join(dirname, "packages/react/"))) {
					return null;
				}

				const resolved = await this.resolve(source, importer);
				if (
					!resolved ||
					resolved.id !==
						path.join(dirname, "packages/react/test/shared/create-root.ts")
				) {
					return null;
				}

				const hasClient = await this.resolve("react-dom/client", importer);
				if (!hasClient) {
					return this.resolve(
						path.join(
							dirname,
							"packages/react/test/shared/create-root-legacy.ts"
						),
						importer
					);
				}
				return null;
			},
		},
	],
	// TODO (43081j): stop faking node globals and sort out the transform
	// tests. Either run them in node, or somehow run babel in node but the
	// tests in browser
	define: {
		IS_REACT_ACT_ENVIRONMENT: true,
		process: {
			env: {},
		},
	},
	test: {
		coverage: {
			enabled: COVERAGE,
			include: [
				"packages/**/dist/**/*.js",
				"packages/react-transform/src/**/*.ts",
			],
			provider: "v8",
			reporter: ["text-summary", "lcov"],
			reportsDirectory: "./coverage",
		},
		projects: [
			{
				extends: true,
				test: {
					include: ["./packages/**/test/**/*.test.tsx"],
					exclude: [
						"./packages/**/test/browser/**/*.test.tsx",
						"**/node_modules/**",
					],
				},
			},
			{
				extends: true,
				test: {
					include: ["./packages/**/test/browser/**/*.test.tsx"],
					exclude: [
						"./packages/devtools-ui/test/browser/**/*.test.tsx",
						"**/node_modules/**",
					],
					browser: {
						provider: playwright(),
						enabled: true,
						screenshotFailures: false,
						headless: true,
						instances: [{ browser: "chromium" }],
					},
				},
			},
		],
	},
});
