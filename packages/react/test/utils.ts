import { act as realAct } from "react-dom/test-utils";

// When testing using react's production build, we can't use act (React
// explicitly throws an error in this situation). So instead we'll fake act by
// just waiting 10ms for React's concurrent rerendering to flush. We'll make a
// best effort to throw a helpful error in afterEach if we detect that act() was
// called but not awaited.
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

let acting = 0;
async function prodActShim(cb: () => void | Promise<void>): Promise<void> {
	acting++;
	try {
		await cb();
		await delay(10);
	} finally {
		acting--;
	}
}

export function checkHangingAct() {
	if (acting > 0) {
		throw new Error(
			`It appears act() was called but not awaited. This could happen if a test threw an Error or if a test forgot to await a call to act. Make sure to await act() calls in tests.`
		);
	}
}

export const act =
	process.env.NODE_ENV === "production"
		? (prodActShim as typeof realAct)
		: realAct;
