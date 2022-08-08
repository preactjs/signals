// eslint-disable-next-line
module.exports = {
	env: {
		browser: true,
		es2021: true,
	},
	extends: [
		"prettier",
		"eslint:recommended",
		"plugin:@typescript-eslint/recommended",
	],
	parser: "@typescript-eslint/parser",
	plugins: ["@typescript-eslint"],
	ignorePatterns: ["**/dist/**"],
	rules: {
		"no-console": "warn",
	},
};
