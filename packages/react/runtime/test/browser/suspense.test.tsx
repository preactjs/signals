// @ts-expect-error
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { createElement, lazy, useLayoutEffect, Suspense } from "react";
import { signal } from "@preact/signals-core";
import {
	useComputed,
	useSignalEffect,
	useSignals,
} from "@preact/signals-react/runtime";
import {
	Root,
	createRoot,
	act,
	checkHangingAct,
	getConsoleErrorSpy,
} from "../../../test/shared/utils";
import { beforeEach, afterEach, describe, it, expect } from "vitest";

describe("Suspense", () => {
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

		// TODO: Consider re-enabling, though updates during finalCleanup are not
		// wrapped in act().
		//
		// checkConsoleErrorLogs();
		checkHangingAct();
	});

	it("should handle suspending and unsuspending", async () => {
		const signal1 = signal(0);
		const signal2 = signal(0);
		function Child() {
			useEverything();
			return <p>{signal1.value}</p>;
		}

		function Middle({ children }: React.PropsWithChildren) {
			useEverything();
			const value = signal1.value;
			useLayoutEffect(() => {
				signal1.value++;
				signal1.value--;
			}, []);
			if (!middlePromResolved) throw middleProm;
			return <div data-foo={value}>{children}</div>;
		}

		function LazyComponent() {
			useEverything();
			return <span>lazy</span>;
		}

		let resolveMiddleProm!: () => void;
		let middlePromResolved = false;
		const middleProm = new Promise(resolve => {
			resolveMiddleProm = () => {
				middlePromResolved = true;
				resolve(undefined);
			};
		});
		let unsuspend!: () => void;
		let prom = new Promise<{ default: React.ComponentType }>(resolve => {
			unsuspend = () => resolve({ default: LazyComponent });
		});
		const SuspendingComponent = lazy(() => prom);

		function useEverything() {
			useSignals();
			signal1.value;
			signal2.value;
			const comp = useComputed(() => ({
				s1: signal1.value,
				s2: signal2.value,
			}));
			comp.value;
			useSignalEffect(() => {
				signal1.value;
				signal2.value;
			});
			useSignals();
			signal1.value;
			signal2.value;
		}

		function Parent() {
			useEverything();
			return (
				<Suspense fallback={<span>loading...</span>}>
					<Child />
					<Middle>
						<SuspendingComponent />
					</Middle>
				</Suspense>
			);
		}

		await render(<Parent />);
		expect(scratch.innerHTML).to.be.oneOf([
			// react 17+
			`<span>loading...</span>`,
			// react 16
			`<p style="display: none !important;">0</p><span>loading...</span>`,
		]);

		await act(async () => {
			signal1.value++;
			signal2.value++;
		});
		await act(async () => {
			signal1.value--;
			signal2.value--;
		});

		await act(async () => {
			resolveMiddleProm();
			await middleProm;
		});

		expect(scratch.innerHTML).to.be.oneOf([
			// react 17+
			`<span>loading...</span>`,
			// react 16
			`<p style="display: none !important;">0</p><div data-foo="0" style="display: none !important;"></div><span>loading...</span>`,
		]);

		await act(async () => {
			unsuspend();
			await prom;
		});

		// react 16 uses `style.setProperty()` to clear display value, which leaves an empty style attr in innerHTML.
		// react 17 does not do this, so we normalize 16 behavior to 17 here.
		scratch
			.querySelectorAll('[style=""]')
			.forEach(node => node.removeAttribute("style"));
		expect(scratch.innerHTML).to.equal(
			`<p>0</p><div data-foo="0"><span>lazy</span></div>`
		);

		await act(async () => {
			signal1.value++;
			signal2.value++;
		});
		expect(scratch.innerHTML).to.equal(
			`<p>1</p><div data-foo="1"><span>lazy</span></div>`
		);
	});

	it("should clean up signals after unmount with multiple suspense boundaries", async () => {
		let watchedCallCount = 0;
		let unwatchedCallCount = 0;

		// Create a signal with watched/unwatched callbacks to track cleanup
		const trackedSignal = signal(0, {
			name: "trackedSignal",
			watched: function () {
				watchedCallCount++;
			},
			unwatched: function () {
				unwatchedCallCount++;
			},
		});

		let resolveFirstProm!: () => void;
		let firstPromResolved = false;
		const firstProm = new Promise(resolve => {
			resolveFirstProm = () => {
				firstPromResolved = true;
				resolve(undefined);
			};
		});

		let resolveSecondProm!: () => void;
		let secondPromResolved = false;
		const secondProm = new Promise(resolve => {
			resolveSecondProm = () => {
				secondPromResolved = true;
				resolve(undefined);
			};
		});

		function FirstSuspendingComponent() {
			useSignals(0);
			// Access the signal before any suspense
			const value = trackedSignal.value;
			if (!firstPromResolved) throw firstProm;
			return <div data-first={value}>First</div>;
		}

		function SecondSuspendingComponent() {
			useSignals();
			// Access the signal after first suspense
			const value = trackedSignal.value;
			if (!secondPromResolved) throw secondProm;
			return <div data-second={value}>Second</div>;
		}

		function RegularComponent() {
			useSignals();
			// Access the signal normally
			return <div data-regular={trackedSignal.value}>Regular</div>;
		}

		function Parent() {
			useSignals();
			// Access the signal at the top level
			const value = trackedSignal.value;
			return (
				<div data-parent={value}>
					<RegularComponent />
					<Suspense fallback={<span>Loading first...</span>}>
						<FirstSuspendingComponent />
					</Suspense>
					<Suspense fallback={<span>Loading second...</span>}>
						<SecondSuspendingComponent />
					</Suspense>
				</div>
			);
		}

		// Initial render - should trigger watched callback
		await render(<Parent />);
		expect(scratch.innerHTML).to.contain("Loading first...");
		expect(scratch.innerHTML).to.contain("Loading second...");
		expect(scratch.innerHTML).to.contain("Regular");

		// Signal should be watched by now
		expect(watchedCallCount).to.be.greaterThan(0);
		expect(unwatchedCallCount).to.equal(0);

		// Resolve first suspense
		await act(async () => {
			resolveFirstProm();
			await firstProm;
		});

		expect(scratch.innerHTML).to.contain("First");
		expect(scratch.innerHTML).to.contain("Loading second...");

		// Resolve second suspense
		await act(async () => {
			resolveSecondProm();
			await secondProm;
		});

		expect(scratch.innerHTML).to.contain("First");
		expect(scratch.innerHTML).to.contain("Second");
		expect(scratch.innerHTML).to.contain("Regular");

		// Update signal to verify it's still being watched
		await act(async () => {
			trackedSignal.value = 42;
		});

		expect(scratch.innerHTML).to.contain('data-parent="42"');
		expect(scratch.innerHTML).to.contain('data-regular="42"');
		expect(scratch.innerHTML).to.contain('data-first="42"');
		expect(scratch.innerHTML).to.contain('data-second="42"');

		// Now unmount the entire tree
		await act(async () => {
			root.unmount();
		});

		expect(scratch.innerHTML).to.equal("");

		// Wait for cleanup to complete
		await new Promise(resolve => setTimeout(resolve, 10));

		// After unmount, the signal should be unwatched
		expect(unwatchedCallCount).to.be.greaterThan(0);

		// Verify the signal is no longer being watched by trying to update it
		// (this won't trigger any re-renders since no components are subscribed)
		trackedSignal.value = 999;

		// The signal value should have changed but no components should re-render
		expect(trackedSignal.value).to.equal(999);
		expect(scratch.innerHTML).to.equal("");
	});

	it("should clean up signals after unmount with multiple suspense boundaries and use of try catch", async () => {
		let watchedCallCount = 0;
		let unwatchedCallCount = 0;

		// Create a signal with watched/unwatched callbacks to track cleanup
		const trackedSignal = signal(0, {
			name: "trackedSignal",
			watched: function () {
				watchedCallCount++;
			},
			unwatched: function () {
				unwatchedCallCount++;
			},
		});

		let resolveFirstProm!: () => void;
		let firstPromResolved = false;
		const firstProm = new Promise(resolve => {
			resolveFirstProm = () => {
				firstPromResolved = true;
				resolve(undefined);
			};
		});

		let resolveSecondProm!: () => void;
		let secondPromResolved = false;
		const secondProm = new Promise(resolve => {
			resolveSecondProm = () => {
				secondPromResolved = true;
				resolve(undefined);
			};
		});

		function FirstSuspendingComponent() {
			const store = useSignals(1);
			try {
				// Access the signal before any suspense
				const value = trackedSignal.value;
				if (!firstPromResolved) throw firstProm;
				return <div data-first={value}>First</div>;
			} finally {
				store.f();
			}
		}

		function SecondSuspendingComponent() {
			const store = useSignals(1);
			try {
				// Access the signal after first suspense
				const value = trackedSignal.value;
				if (!secondPromResolved) throw secondProm;
				return <div data-second={value}>Second</div>;
			} finally {
				store.f();
			}
		}

		function RegularComponent() {
			const store = useSignals(1);
			try {
				// Access the signal normally
				return <div data-regular={trackedSignal.value}>Regular</div>;
			} finally {
				store.f();
			}
		}

		function Parent() {
			const store = useSignals(1);
			try {
				// Access the signal at the top level
				const value = trackedSignal.value;
				return (
					<div data-parent={value}>
						<RegularComponent />
						<Suspense fallback={<span>Loading first...</span>}>
							<FirstSuspendingComponent />
						</Suspense>
						<Suspense fallback={<span>Loading second...</span>}>
							<SecondSuspendingComponent />
						</Suspense>
					</div>
				);
			} finally {
				store.f();
			}
		}

		// Initial render - should trigger watched callback
		await render(<Parent />);
		expect(scratch.innerHTML).to.contain("Loading first...");
		expect(scratch.innerHTML).to.contain("Loading second...");
		expect(scratch.innerHTML).to.contain("Regular");

		// Signal should be watched by now
		expect(watchedCallCount).to.be.greaterThan(0);
		expect(unwatchedCallCount).to.equal(0);

		// Resolve first suspense
		await act(async () => {
			resolveFirstProm();
			await firstProm;
		});

		expect(scratch.innerHTML).to.contain("First");
		expect(scratch.innerHTML).to.contain("Loading second...");

		// Resolve second suspense
		await act(async () => {
			resolveSecondProm();
			await secondProm;
		});

		expect(scratch.innerHTML).to.contain("First");
		expect(scratch.innerHTML).to.contain("Second");
		expect(scratch.innerHTML).to.contain("Regular");

		// Update signal to verify it's still being watched
		await act(async () => {
			trackedSignal.value = 42;
		});

		expect(scratch.innerHTML).to.contain('data-parent="42"');
		expect(scratch.innerHTML).to.contain('data-regular="42"');
		expect(scratch.innerHTML).to.contain('data-first="42"');
		expect(scratch.innerHTML).to.contain('data-second="42"');

		// Now unmount the entire tree
		await act(async () => {
			root.unmount();
		});

		expect(scratch.innerHTML).to.equal("");

		// Wait for cleanup to complete
		await new Promise(resolve => setTimeout(resolve, 10));

		// After unmount, the signal should be unwatched
		expect(unwatchedCallCount).to.be.greaterThan(0);

		// Verify the signal is no longer being watched by trying to update it
		// (this won't trigger any re-renders since no components are subscribed)
		trackedSignal.value = 999;

		// The signal value should have changed but no components should re-render
		expect(trackedSignal.value).to.equal(999);
		expect(scratch.innerHTML).to.equal("");
	});

	it("should maintain signal watching and clean up after unmount", async () => {
		let watchedCallCount = 0;
		let unwatchedCallCount = 0;

		// Create a signal with watched/unwatched callbacks to track cleanup
		const trackedSignal = signal(0, {
			name: "trackedSignal",
			watched: function () {
				watchedCallCount++;
			},
			unwatched: function () {
				unwatchedCallCount++;
			},
		});

		function RegularComponent() {
			useSignals();
			// Access the signal normally
			return <div data-regular={trackedSignal.value}>Regular</div>;
		}

		function Parent() {
			useSignals();
			// Access the signal at the top level
			const value = trackedSignal.value;
			return (
				<div data-parent={value}>
					<RegularComponent />
				</div>
			);
		}

		// Initial render - should trigger watched callback
		await render(<Parent />);
		expect(scratch.innerHTML).to.contain("Regular");

		// Signal should be watched by now
		expect(watchedCallCount).to.be.greaterThan(0);
		expect(unwatchedCallCount).to.equal(0);

		// Update signal - should work normally
		await act(async () => {
			trackedSignal.value = 10;
		});

		expect(scratch.innerHTML).to.contain('data-parent="10"');
		expect(scratch.innerHTML).to.contain('data-regular="10"');

		// Update signal again
		await act(async () => {
			trackedSignal.value = 20;
		});

		expect(scratch.innerHTML).to.contain('data-parent="20"');
		expect(scratch.innerHTML).to.contain('data-regular="20"');

		// Signal should still be watched (no unwatched calls yet)
		expect(unwatchedCallCount).to.equal(0);

		// Now unmount the entire tree
		await act(async () => {
			root.unmount();
		});

		expect(scratch.innerHTML).to.equal("");

		// Wait for cleanup to complete
		await new Promise(resolve => setTimeout(resolve, 10));

		// After unmount, the signal should be unwatched
		expect(unwatchedCallCount).to.be.greaterThan(0);

		// Verify the signal is no longer being watched by trying to update it
		// (this won't trigger any re-renders since no components are subscribed)
		trackedSignal.value = 999;

		// The signal value should have changed but no components should re-render
		expect(trackedSignal.value).to.equal(999);
		expect(scratch.innerHTML).to.equal("");
	});
});
