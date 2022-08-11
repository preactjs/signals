import { teardown as testUtilTeardown } from "preact/test-utils";

/**
 * Setup the test environment
 */
export function setupScratch(id = "scratch"): HTMLDivElement {
	const scratch = document.createElement("div");
	scratch.id = id;
	(document.body || document.documentElement).appendChild(scratch);
	return scratch;
}

/**
 * Teardown test environment and reset preact's internal state
 */
export function teardown(scratch: HTMLDivElement) {
	if (scratch) {
		scratch.parentNode!.removeChild(scratch);
	}

	testUtilTeardown();
}
