// eslint-disable-next-line
module.exports = {
	env: {
		node: true,
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
		"@typescript-eslint/no-unused-vars": [
			"error",
			{ varsIgnorePattern: "createElement" },
		],
		"no-console": "warn",
		"@typescript-eslint/no-var-requires": "off",
		"no-mixed-spaces-and-tabs": "off",
		"prefer-const": "off",
		"@typescript-eslint/no-explicit-any": "off",
		"@typescript-eslint/ban-ts-comment": "off",
		"@typescript-eslint/no-non-null-assertion": "off",
	},
};
