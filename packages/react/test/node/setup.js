// import register from "@babel/register";
const register = require("@babel/register").default;

const coverage = String(process.env.COVERAGE) === "true";

// @babel/register doesn't hook into the experimental NodeJS ESM loader API so
// we need all test files to run as CommonJS modules in Node
const env = [
	"@babel/preset-env",
	{
		targets: {
			node: "current",
		},
		loose: true,
		modules: "commonjs",
	},
];

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

register({
	extensions: [".js", ".mjs", ".ts", ".tsx", ".mts", ".mtsx"],
	cache: true,

	sourceMaps: "inline",
	presets: [ts, jsx, env],
	plugins: [
		coverage && [
			"istanbul",
			{
				// TODO: Currently NodeJS tests always run against dist files. Should we
				// change this?
				// include: minify ? "**/dist/**/*.js" : "**/src/**/*.{js,jsx,ts,tsx}",
			},
		],
	].filter(Boolean),
});
