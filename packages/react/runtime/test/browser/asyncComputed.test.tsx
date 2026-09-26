// @ts-expect-error React's act environment flag is intentionally global.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { Component, createElement, StrictMode, Suspense } from "react";
import type { ReactNode } from "react";
import { asyncComputed, signal } from "@preact/signals-core";
import { useAsyncComputed, useSignals } from "@preact/signals-react/runtime";
import {
	Root,
	act,
	checkHangingAct,
	createRoot,
	getConsoleErrorSpy,
} from "../../../test/shared/utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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

class Boundary extends Component<{ children: ReactNode }, { error?: Error }> {
	state: { error?: Error } = {};
	static getDerivedStateFromError(error: Error) {
		return { error };
	}
	render() {
		return this.state.error ? (
			<p>caught:{this.state.error.message}</p>
		) : (
			this.props.children
		);
	}
}

describe("useAsyncComputed", () => {
	let scratch: HTMLDivElement;
	let root: Root;

	async function render(element: Parameters<Root["render"]>[0]) {
		await act(() => root.render(element));
	}

	beforeEach(async () => {
		scratch = document.createElement("div");
		document.body.appendChild(scratch);
		root = await createRoot(scratch);
		getConsoleErrorSpy().mockClear();
	});

	afterEach(async () => {
		await act(() => root.unmount());
		scratch.remove();
		checkHangingAct();
	});

	it("owns a callback-created instance and renders its result", async () => {
		const deferred = defer<string>();
		function App() {
			useSignals();
			const result = useAsyncComputed(() => deferred.promise);
			return <p>{result.value ?? "none"}</p>;
		}

		await render(<App />);
		expect(scratch.textContent).to.equal("none");

		await act(async () => {
			deferred.resolve("hello");
			await tick();
		});
		expect(scratch.textContent).to.equal("hello");
	});

	it("uses the latest callback after a reactive dependency changes", async () => {
		const dependency = signal(1);
		function App({ prefix }: { prefix: string }) {
			useSignals();
			const result = useAsyncComputed(() => `${prefix}:${dependency.value}`);
			return <p>{result.value ?? "none"}</p>;
		}

		await render(<App prefix="first" />);
		expect(scratch.textContent).to.equal("first:1");

		await render(<App prefix="second" />);
		await act(async () => {
			dependency.value = 2;
			await tick();
		});
		expect(scratch.textContent).to.equal("second:2");
	});

	it("survives StrictMode effect replay", async () => {
		function App() {
			useSignals();
			const result = useAsyncComputed(() => "ready");
			return <p>{result.value ?? "none"}</p>;
		}

		await render(
			<StrictMode>
				<App />
			</StrictMode>
		);
		await act(tick);
		expect(scratch.textContent).to.equal("ready");
	});

	it("throws errors to an error boundary by default", async () => {
		const deferred = defer<string>();
		function App() {
			useSignals();
			const result = useAsyncComputed(() => deferred.promise);
			return <p>{result.value ?? "none"}</p>;
		}

		await render(
			<Boundary>
				<App />
			</Boundary>
		);
		await act(async () => {
			deferred.reject(new Error("boom"));
			await tick();
		});
		expect(scratch.textContent).to.equal("caught:boom");
	});

	it("throws a useful error for an undefined rejection", async () => {
		const deferred = defer<string>();
		function App() {
			useSignals();
			const result = useAsyncComputed(() => deferred.promise);
			return <p>{result.value ?? "none"}</p>;
		}

		await render(
			<Boundary>
				<App />
			</Boundary>
		);
		await act(async () => {
			deferred.reject(undefined);
			await tick();
		});
		expect(scratch.textContent).to.equal(
			"caught:Async computed failed without an error"
		);
	});

	it("exposes errors when throwOnError is disabled", async () => {
		const deferred = defer<string>();
		function App() {
			useSignals();
			const result = useAsyncComputed(() => deferred.promise, {
				throwOnError: false,
			});
			return (
				<p>
					{result.error.value
						? `error:${(result.error.value as Error).message}`
						: "ok"}
				</p>
			);
		}

		await render(<App />);
		await act(async () => {
			deferred.reject(new Error("boom"));
			await tick();
		});
		expect(scratch.textContent).to.equal("error:boom");
	});

	it("disposes callback-created instances on unmount", async () => {
		const dependency = signal(1);
		const deferred = defer<number>();
		let runs = 0;
		function App() {
			useSignals();
			const result = useAsyncComputed(() => {
				runs++;
				const current = dependency.value;
				return deferred.promise.then(() => current);
			});
			return <p>{result.value ?? "none"}</p>;
		}

		await render(<App />);
		await act(() => root.unmount());
		dependency.value = 2;
		deferred.resolve(1);
		await tick();
		expect(runs).to.equal(1);
	});

	it("suspends with an externally owned instance and then resolves", async () => {
		const deferred = defer<string>();
		const external = asyncComputed(() => deferred.promise);
		function App() {
			useSignals();
			const result = useAsyncComputed(external, { suspend: true });
			return <p>{result.value}</p>;
		}

		await render(
			<Suspense fallback={<span>loading</span>}>
				<App />
			</Suspense>
		);
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
			useSignals();
			const result = useAsyncComputed(external, { suspend: true });
			return <p>{result.settled.value ? "ready" : "pending"}</p>;
		}

		await render(
			<Suspense fallback={<span>loading</span>}>
				<App />
			</Suspense>
		);
		expect(scratch.textContent).to.equal("loading");

		await act(async () => {
			deferreds[0].resolve();
			await tick();
		});
		expect(scratch.textContent).to.equal("ready");

		await act(() => {
			dependency.value = 2;
		});
		expect(external.pending.value).to.equal(true);
		expect(scratch.textContent).to.equal("ready");
		deferreds[1].resolve();
		external.dispose();
	});

	it("does not dispose externally owned instances", async () => {
		const dependency = signal(1);
		let runs = 0;
		const external = asyncComputed(() => {
			runs++;
			return dependency.value;
		});
		function App() {
			useSignals();
			const result = useAsyncComputed(external);
			return <p>{result.value}</p>;
		}

		await render(<App />);
		await act(() => root.unmount());
		dependency.value = 2;
		expect(runs).to.equal(2);
		expect(external.value).to.equal(2);
		external.dispose();
	});
});
