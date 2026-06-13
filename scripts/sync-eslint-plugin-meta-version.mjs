import { readFile, writeFile } from "node:fs/promises";

const packageJsonUrl = new URL(
	"../packages/eslint-plugin-signals/package.json",
	import.meta.url
);
const pluginUrl = new URL(
	"../packages/eslint-plugin-signals/src/index.mjs",
	import.meta.url
);

const packageJson = JSON.parse(await readFile(packageJsonUrl, "utf8"));
const pluginSource = await readFile(pluginUrl, "utf8");
const versionPattern = /(\bversion:\s*")[^"]+(")/;

if (!versionPattern.test(pluginSource)) {
	throw new Error("Unable to update eslint plugin meta.version");
}

const nextSource = pluginSource.replace(
	versionPattern,
	`$1${packageJson.version}$2`
);

if (nextSource !== pluginSource) {
	await writeFile(pluginUrl, nextSource);
}
