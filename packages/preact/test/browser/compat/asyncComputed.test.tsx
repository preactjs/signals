import { asyncComputed, signal, useAsyncComputed } from "@preact/signals";
import { createElement, render } from "preact";
import type { ComponentChildren, FunctionComponent } from "preact";
// @ts-ignore The untyped shim avoids preact/compat's global React declaration.
import { Suspense as CompatSuspense } from "./suspense-compat.js";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const Suspense = CompatSuspense as FunctionComponent<{
	fallback?: ComponentChildren;
	children?: ComponentChildren;
}>;

function defer<T = void>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

function track<T>(dependency: unknown, value: T): T {
	void dependency;
	return value;
}

describe("useAsyncComputed with compat", () => {
	let scratch: HTMLDivElement;

	beforeEach(() => {
		scratch = document.createElement("div");
	});

	afterEach(() => {
		render(null, scratch);
	});

	it("suspends with an externally owned instance and then resolves", async () => {
		const deferred = defer<string>();
		const external = asyncComputed(() => deferred.promise);
		function App() {
			const result = useAsyncComputed(external, { suspend: true });
			return <p>{result.value}</p>;
		}

		act(() => {
			render(
				<Suspense fallback={<span>loading</span>}>
					<App />
				</Suspense>,
				scratch
			);
		});
		expect(scratch.textContent).to.equal("loading");

		await act(async () => {
			deferred.resolve("hello");
			await tick();
		});
		expect(scratch.textContent).to.equal("hello");
	});

	it("does not re-suspend after settling with undefined", async () => {
		const dependency = signal(1);
		const deferreds: ReturnType<typeof defer<void>>[] = [];
		const external = asyncComputed(() => {
			const deferred = defer();
			deferreds.push(deferred);
			return track(dependency.value, deferred.promise);
		});
		function App() {
			const result = useAsyncComputed(external, { suspend: true });
			return <p>{result.settled.value ? "ready" : "pending"}</p>;
		}

		act(() => {
			render(
				<Suspense fallback={<span>loading</span>}>
					<App />
				</Suspense>,
				scratch
			);
		});
		expect(scratch.textContent).to.equal("loading");

		await act(async () => {
			deferreds[0].resolve();
			await tick();
		});
		expect(scratch.textContent).to.equal("ready");

		act(() => {
			dependency.value = 2;
		});
		expect(external.pending.value).to.equal(true);
		expect(scratch.textContent).to.equal("ready");
		deferreds[1].resolve();
		external.dispose();
	});
});
