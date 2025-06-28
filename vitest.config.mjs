import { defineConfig } from 'vitest/config';

const COVERAGE = process.env.COVERAGE === 'true';

export default defineConfig({
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
			'packages/*/vitest.config.mjs',
			'packages/*/vitest.browser.config.mjs'
		]
	}
});
