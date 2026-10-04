// @ts-expect-error
// @noUseSignals
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { Component, createElement, Suspense, useState } from "react";
import { computed, signal, Signal } from "@preact/signals-core";
import { useSignals } from "@preact/signals-react/runtime";
import type { EffectStore } from "@preact/signals-react/runtime";
import {
	Root,
	createRoot,
	act,
	getConsoleErrorSpy,
} from "../../../test/shared/utils";
import { beforeEach, afterEach, describe, it, expect } from "vitest";

function getTargets(signal: object): unknown {
	return (signal as any)._targets;
}

class ErrorBoundary extends Component<
	React.PropsWithChildren<{ onFallback?: () => void }>,
	{ failed: boolean }
> {
	state = { failed: false };

	static getDerivedStateFromError() {
		return { failed: true };
	}

	componentDidCatch() {}

	render() {
		if (this.state.failed) {
			this.props.onFallback?.();
			return createElement("span", null, "error");
		}
		return this.props.children;
	}
}

describe("subscription lifecycle", () => {
	let scratch: HTMLDivElement;
	let root: Root;
	let originalSubscribe: typeof Signal.prototype._subscribe;

	beforeEach(async () => {
		scratch = document.createElement("div");
		document.body.appendChild(scratch);
		root = await createRoot(scratch);
		getConsoleErrorSpy().mockClear();
		originalSubscribe = Signal.prototype._subscribe;
	});

	afterEach(async () => {
		await act(() => root.unmount());
		scratch.remove();
		expect(Signal.prototype._subscribe).to.equal(originalSubscribe);
	});

	it("restores the outer collector after a nested managed hook", async () => {
		let watchedCallCount = 0;
		const tracked = signal(0, {
			watched() {
				watchedCallCount++;
			},
		});
		let resolve!: () => void;
		let resolved = false;
		const pending = new Promise<void>(r => {
			resolve = r;
		});

		/** @noUseSignals */
		function useInner() {
			const store = useSignals(2);
			try {
				return 1;
			} finally {
				store.f();
			}
		}

		/** @noUseSignals */
		function App() {
			const store = useSignals(1);
			try {
				useInner();
				const value = tracked.value;
				if (!resolved) throw pending;
				return <p>{value}</p>;
			} finally {
				store.f();
			}
		}

		await act(() => {
			root.render(
				<Suspense fallback={<span>loading</span>}>
					<App />
				</Suspense>
			);
		});
		expect(scratch.innerHTML).to.equal("<span>loading</span>");
		expect(watchedCallCount).to.equal(0);
		expect(getTargets(tracked)).to.equal(undefined);

		resolved = true;
		await act(async () => {
			resolve();
			await pending;
		});
		expect(scratch.innerHTML).to.equal("<p>0</p>");
		expect(watchedCallCount).to.equal(1);
	});

	it("does not replay computed dependencies from an abandoned update", async () => {
		const stable = signal(0);
		const source = signal(1);
		const abandoned = computed(() => source.value * 2);
		let setPhase!: (phase: number) => void;
		let resolve!: () => void;
		const pending = new Promise<void>(r => {
			resolve = r;
		});

		/** @noUseSignals */
		function App() {
			const [phase, updatePhase] = useState(0);
			setPhase = updatePhase;
			const store = useSignals(1);
			try {
				if (phase === 1) {
					void abandoned.value;
					throw pending;
				}
				return (
					<p>
						{stable.value}:{phase}
					</p>
				);
			} finally {
				store.f();
			}
		}

		await act(() => {
			root.render(
				<Suspense fallback={<span>loading</span>}>
					<App />
				</Suspense>
			);
		});
		await act(() => setPhase(1));
		expect(getTargets(source)).to.equal(undefined);
		expect(getTargets(abandoned)).to.equal(undefined);

		await act(async () => {
			setPhase(2);
			resolve();
			await pending;
		});
		expect(scratch.textContent).to.equal("0:2");
		expect(getTargets(source)).to.equal(undefined);
		expect(getTargets(abandoned)).to.equal(undefined);
	});

	it("drops pending subscriptions when a suspended component unmounts", async () => {
		const tracked = signal(0);
		let store!: EffectStore;
		let setSuspended!: (suspended: boolean) => void;
		const pending = new Promise<void>(() => {});

		/** @noUseSignals */
		function App() {
			const [suspended, updateSuspended] = useState(false);
			setSuspended = updateSuspended;
			store = useSignals(1);
			try {
				if (suspended) {
					void tracked.value;
					throw pending;
				}
				return <p>ready</p>;
			} finally {
				store.f();
			}
		}

		await act(() => {
			root.render(
				<Suspense fallback={<span>loading</span>}>
					<App />
				</Suspense>
			);
		});
		await act(() => setSuspended(true));
		expect(store._subscribers.length).to.be.greaterThan(0);

		await act(() => root.unmount());
		expect(store._subscribers).to.have.length(0);
		expect(getTargets(tracked)).to.equal(undefined);
	});

	it("restores and invokes the subscribe implementation active before rendering", async () => {
		const tracked = signal(0);
		let wrapperCallCount = 0;
		function subscribeWrapper(
			this: Signal,
			node: Parameters<Signal["_subscribe"]>[0]
		) {
			wrapperCallCount++;
			return originalSubscribe.call(this, node);
		}
		Signal.prototype._subscribe = subscribeWrapper;
		let resolve!: () => void;
		let resolved = false;
		const pending = new Promise<void>(r => {
			resolve = r;
		});
		let restoredWrapper = false;

		/** @noUseSignals */
		function App(): JSX.Element {
			const store = useSignals(1);
			try {
				const value = tracked.value;
				if (!resolved) throw pending;
				return <p>{value}</p>;
			} finally {
				store.f();
			}
		}

		try {
			await act(() => {
				root.render(
					<Suspense fallback={<span>loading</span>}>
						<App />
					</Suspense>
				);
			});
			restoredWrapper = Signal.prototype._subscribe === subscribeWrapper;

			resolved = true;
			await act(async () => {
				resolve();
				await pending;
			});
		} finally {
			Signal.prototype._subscribe = originalSubscribe;
		}

		expect(restoredWrapper).to.equal(true);
		expect(wrapperCallCount).to.equal(1);
	});

	it("restores the prototype before rendering an error boundary", async () => {
		const tracked = signal(0);
		let subscribeSeenByFallback: typeof Signal.prototype._subscribe | undefined;

		/** @noUseSignals */
		function App(): JSX.Element {
			const store = useSignals(1);
			try {
				void tracked.value;
				throw new Error("render failed");
			} finally {
				store.f();
			}
		}

		await act(() => {
			root.render(
				<ErrorBoundary
					onFallback={() => {
						subscribeSeenByFallback = Signal.prototype._subscribe;
					}}
				>
					<App />
				</ErrorBoundary>
			);
		});

		expect(scratch.innerHTML).to.equal("<span>error</span>");
		expect(subscribeSeenByFallback).to.equal(originalSubscribe);
		expect(Signal.prototype._subscribe).to.equal(originalSubscribe);
		expect(getTargets(tracked)).to.equal(undefined);
	});

	it("restores the prototype when starting an effect throws", async () => {
		let store!: EffectStore;
		let rerender!: () => void;
		let subscribeSeenByFallback: typeof Signal.prototype._subscribe | undefined;

		/** @noUseSignals */
		function App() {
			const [, setVersion] = useState(0);
			rerender = () => setVersion(version => version + 1);
			store = useSignals(1);
			try {
				return <p>ready</p>;
			} finally {
				store.f();
			}
		}

		await act(() => {
			root.render(
				<ErrorBoundary
					onFallback={() => {
						subscribeSeenByFallback = Signal.prototype._subscribe;
					}}
				>
					<App />
				</ErrorBoundary>
			);
		});

		const originalStart = store.effect._start;
		store.effect._start = () => {
			throw new Error("start failed");
		};
		try {
			await act(() => rerender());
		} finally {
			store.effect._start = originalStart;
		}

		expect(scratch.innerHTML).to.equal("<span>error</span>");
		expect(subscribeSeenByFallback).to.equal(originalSubscribe);
		expect(Signal.prototype._subscribe).to.equal(originalSubscribe);
	});
});
