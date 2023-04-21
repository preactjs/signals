import React from "react";
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
