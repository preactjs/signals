import { createElement } from "preact";
import { afterEach, beforeEach, expect } from "vitest";

function assertNoCompat() {
	// Compat's vnode hook adds React's element marker. Check before and after
	// every test so both static imports and imports during a test are caught.
	expect(
		createElement("div", null),
		"preact/compat must only be imported in the preact-compat project"
	).not.toHaveProperty("$$typeof");
}

beforeEach(assertNoCompat);
afterEach(assertNoCompat);
