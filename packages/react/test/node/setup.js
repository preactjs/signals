// import register from "@babel/register";
const register = require("@babel/register").default;

const coverage = String(process.env.COVERAGE) === "true";
const minify = String(process.env.MINIFY) === "true";

const rename = {};
const mangle = require("../../../../mangle.json");
for (let prop in mangle.props.props) {
	let name = prop;
	if (name[0] === "$") {
		name = name.slice(1);
	}
	rename[name] = mangle.props.props[prop];
}

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

const renamePlugin = [
	"babel-plugin-transform-rename-properties",
	{
		rename,
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
				include: minify ? "**/dist/**/*.js" : "**/src/**/*.{ts,js}",
			},
		],
		minify && renamePlugin,
	].filter(Boolean),
});
