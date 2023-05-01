import React from "react";
import sinon from "sinon";
import { act as realAct } from "react-dom/test-utils";

export interface Root {
	render(element: JSX.Element | null): void;
	unmount(): void;
}

export const isProd = process.env.NODE_ENV === "production";
export const isReact16 = React.version.startsWith("16.");

// We need to use createRoot() if it's available, but it's only available in
// React 18. To enable local testing with React 16 & 17, we'll create a fake
// createRoot() that uses render() and unmountComponentAtNode() instead.
let createRootCache: ((container: Element) => Root) | undefined;
export async function createRoot(container: Element): Promise<Root> {
	if (!createRootCache) {
		try {
			// @ts-expect-error ESBuild will replace this import with a require() call
			// if it resolves react-dom/client. If it doesn't, it will leave the
			// import untouched causing a runtime error we'll handle below.
			const { createRoot } = await import("react-dom/client");
			createRootCache = createRoot;
		} catch (e) {
			// @ts-expect-error ESBuild will replace this import with a require() call
			// if it resolves react-dom.
			const { render, unmountComponentAtNode } = await import("react-dom");
			createRootCache = (container: Element) => ({
				render(element: JSX.Element) {
					render(element, container);
				},
				unmount() {
					unmountComponentAtNode(container);
				},
			});
		}
	}

	return createRootCache(container);
}

// When testing using react's production build, we can't use act (React
// explicitly throws an error in this situation). So instead we'll fake act by
// waiting for a requestAnimationFrame and then 10ms for React's concurrent
// rerendering and any effects to flush. We'll make a best effort to throw a
// helpful error in afterEach if we detect that act() was called but not
// awaited.
const afterFrame = (ms: number) =>
	new Promise(r => requestAnimationFrame(() => setTimeout(r, ms)));

let acting = 0;
async function prodActShim(cb: () => void | Promise<void>): Promise<void> {
	acting++;
	try {
		await cb();
		await afterFrame(10);
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

/**
 * `console.log` supports formatting strings with `%s` for string substitutions.
 * This function accepts a string and additional arguments of values and returns
 * a string with the values substituted in.
 */
export function consoleFormat(str: string, ...values: unknown[]): string {
	let idx = 0;
	return str.replace(/%s/g, () => String(values[idx++]));
}

declare global {
	let errorSpy: sinon.SinonSpy | undefined;
}

// Only one spy can be active on an object at a time and since all tests share
// the same console object we need to make sure we're only spying on it once.
// We'll use this method to share the spy across all tests.
export function getConsoleErrorSpy(): sinon.SinonSpy {
	if (typeof errorSpy === "undefined") {
		(globalThis as any).errorSpy = sinon.spy(console, "error");
	}

	return errorSpy!;
}

const messagesToIgnore = [
	// Ignore errors for timeouts of tests that often happen while debugging
	/async tests and hooks,/,
	// Ignore React 16 warnings about awaiting `act` calls (warning removed in React 18)
	/Do not await the result of calling act/,
	// Ignore how chai or mocha uses `console.error` to print out errors
	/AssertionError/,
];

export function checkConsoleErrorLogs(): void {
	const errorSpy = getConsoleErrorSpy();
	if (errorSpy.called) {
		let message: string;
		if (errorSpy.firstCall.args[0].toString().includes("%s")) {
			const firstArg = errorSpy.firstCall.args[0];
			message = consoleFormat(firstArg, ...errorSpy.firstCall.args.slice(1));
		} else {
			message = errorSpy.firstCall.args.join(" ");
		}

		if (messagesToIgnore.every(re => re.test(message) === false)) {
			expect.fail(
				`Console.error was unexpectedly called with this message: \n${message}`
			);
		}
	}
}
