import { asyncComputed, signal, useAsyncComputed } from "@preact/signals";
import { Component, createElement, render } from "preact";
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

class Boundary extends Component<
	{ children: ComponentChildren },
	{ error?: Error }
> {
	state: { error?: Error } = {};
	componentDidCatch(error: Error) {
		this.setState({ error });
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

	beforeEach(() => {
		scratch = document.createElement("div");
	});

	afterEach(() => {
		render(null, scratch);
	});

	it("owns a callback-created instance and renders its result", async () => {
		const deferred = defer<string>();
		function App() {
			const result = useAsyncComputed(() => deferred.promise);
			return <p>{result.value ?? "none"}</p>;
		}

		render(<App />, scratch);
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
			const result = useAsyncComputed(() => `${prefix}:${dependency.value}`);
			return <p>{result.value ?? "none"}</p>;
		}

		act(() => render(<App prefix="first" />, scratch));
		expect(scratch.textContent).to.equal("first:1");

		render(<App prefix="second" />, scratch);
		await act(async () => {
			dependency.value = 2;
			await tick();
		});
		expect(scratch.textContent).to.equal("second:2");
	});

	it("throws errors to an error boundary by default", async () => {
		const deferred = defer<string>();
		function App() {
			const result = useAsyncComputed(() => deferred.promise);
			return <p>{result.value ?? "none"}</p>;
		}

		render(
			<Boundary>
				<App />
			</Boundary>,
			scratch
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
			const result = useAsyncComputed(() => deferred.promise);
			return <p>{result.value ?? "none"}</p>;
		}

		render(
			<Boundary>
				<App />
			</Boundary>,
			scratch
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

		render(<App />, scratch);
		deferred.reject(new Error("boom"));
		await act(tick);
		expect(scratch.textContent).to.equal("error:boom");
	});

	it("disposes callback-created instances on unmount", async () => {
		const dependency = signal(1);
		const deferred = defer<number>();
		let runs = 0;
		function App() {
			const result = useAsyncComputed(() => {
				runs++;
				const current = dependency.value;
				return deferred.promise.then(() => current);
			});
			return <p>{result.value ?? "none"}</p>;
		}

		act(() => render(<App />, scratch));
		await act(tick);
		act(() => render(null, scratch));
		dependency.value = 2;
		deferred.resolve(1);
		await tick();
		expect(runs).to.equal(1);
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

	it("does not dispose externally owned instances", async () => {
		const dependency = signal(1);
		let runs = 0;
		const external = asyncComputed(() => {
			runs++;
			return dependency.value;
		});
		function App() {
			const result = useAsyncComputed(external);
			return <p>{result.value}</p>;
		}

		render(<App />, scratch);
		render(null, scratch);
		dependency.value = 2;
		expect(runs).to.equal(2);
		expect(external.value).to.equal(2);
		external.dispose();
	});
});
