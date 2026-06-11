import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import plugin from "../src/index.mjs";

const packageJson = JSON.parse(
	await readFile(new URL("../package.json", import.meta.url), "utf8")
);

describe("plugin meta", () => {
	it("should expose the package name", () => {
		assert.equal(plugin.meta.name, "@preact/eslint-plugin-signals");
	});

	it("should expose the package version", () => {
		assert.equal(plugin.meta.version, packageJson.version);
	});
});
