import tsParser from "@typescript-eslint/parser";
import signals from "eslint-plugin-signals";

export default [
	{
		files: ["**/*.{ts,tsx}"],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: "module",
			parser: tsParser,
			parserOptions: {
				ecmaFeatures: { jsx: true },
				project: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		plugins: { signals },
		rules: {
			"signals/no-signal-write-in-computed": "error",
			"signals/no-value-after-await": "error",
			"signals/no-signal-truthiness": "error",
			"signals/no-conditional-value-read": "warn",
		},
	},
];
