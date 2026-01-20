import { defineConfig } from 'vitest/config';

export default defineConfig({
	optimizeDeps: {
		include: ["preact/jsx-dev-runtime"],
	},
	test: {
		include: ['./test/browser/**/*.test.tsx'],
		browser: {
			provider: 'playwright',
			enabled: true,
			screenshotFailures: false,
			headless: true,
			instances: [{ browser: 'chromium' }]
		}
	}
});
