import { defineConfig } from 'vitest/config';
import { manglePlugin } from './scripts/mangle-plugin.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MINIFY = process.env.MINIFY === "true";
const COVERAGE = process.env.COVERAGE === 'true';
const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	resolve: {
		alias: MINIFY ? {
			'@preact/signals-core': path.join(
				dirname, './packages/core/dist/signals-core.min.js'
			),
			'@preact/signals': path.join(
				dirname, './packages/preact/dist/signals.min.js'
			),
			'@preact/signals-react': path.join(
				dirname, './packages/react/dist/signals.min.js'
			),
			'@preact/signals-react-utils': path.join(
				dirname, './packages/react/utils/utils.min.js'
			),
			'@preact/signals-react-transform': path.join(
				dirname ,'./packages/react-transform/dist/signals-transform.mjs'
			),
			'@preact/signals-utils': path.join(
				dirname, './packages/preact/utils/dist/utils.min.js'
			),
		} : {}
	},
	plugins: [
		manglePlugin
	],
	test: {
		coverage: {
			enabled: COVERAGE,
			include: [
				'packages/**/src/**/*.tsx',
				'packages/**/src/**/*.ts'
			],
			provider: 'v8',
			reporter: ['text-summary', 'lcov'],
			reportsDirectory: './coverage'
		},
		projects: [
			{
				extends: true,
				test: {
					include: [
						'./packages/{,preact/utils,preact}/test/**/*.test.tsx',
						'!./packages/{,preact/utils,preact}/test/browser/**/*.test.tsx'
					],
				}
			},
			{
				extends: true,
				test: {
					include: ['./packages/{,preact/utils,preact}/test/browser/**/*.test.tsx'],
					browser: {
						provider: 'playwright',
						enabled: true,
						screenshotFailures: false,
						headless: true,
						instances: [{ browser: 'chromium' }]
					}
				}
			}
		]
	}
});
