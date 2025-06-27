import { defineConfig } from "vitest/config";
import path from "node:path";

const MINIFY = String(process.env.MINIFY) === "true";

function pkgDir(filePath: string): string {
	// @ts-ignore
	return path.join(import.meta.dirname, "packages", filePath);
}

export default defineConfig({
	esbuild: {
		jsx: "transform",
		jsxFactory: "createElement",
		jsxFragment: "Fragment",
		jsxDev: false,
	},
	resolve: {
		alias: {
			"@preact/signals-core": pkgDir("core/src/index.ts"),
			"@preact/signals-react/runtime": pkgDir("react/runtime/src/index.ts"),
			"@preact/signals-react": pkgDir("react/src/index.ts"),
			"@preact/signals": pkgDir("preact/src/index.ts"),
		},
	},
	test: {
		projects: [
			{
				extends: true,
				test: {
					include: ["packages/core/test/**/*.test.{ts,js,jsx,tsx}"],
					name: "core",
					environment: "node",
				},
			},
			{
				extends: true,
				test: {
					include: ["packages/preact/test/**/*.test.{ts,js,jsx,tsx}"],
					name: "preact",
					browser: {
						provider: "playwright",
						enabled: true,
						instances: [{ browser: "chromium", headless: true }],
					},
				},
			},
			{
				extends: true,
				test: {
					include: [
						"packages/react/test/browser/**/*.test.{ts,js,jsx,tsx}",
						"packages/react/runtime/test/browser/**/*.test.{ts,js,jsx,tsx}",
					],
					name: "react-browser",
					browser: {
						provider: "playwright",
						enabled: true,
						instances: [{ browser: "chromium", headless: true }],
					},
				},
			},
			{
				extends: true,
				test: {
					include: [
						"packages/react/test/node/**/*.test.{ts,js,jsx,tsx}",
						"packages/react/runtime/test/node/**/*.test.{ts,js,jsx,tsx}",
					],
					name: "react-node",
					environment: "node",
				},
			},
		],
		// ... Specify options here.
	},
});
