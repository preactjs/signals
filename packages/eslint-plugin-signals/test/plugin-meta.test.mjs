import { describe, it } from "node:test";
import assert from "node:assert/strict";
import plugin from "../src/index.mjs";

describe("plugin meta", () => {
	it("should expose the package name", () => {
		assert.equal(plugin.meta.name, "@preact/eslint-plugin-signals");
	});
});
