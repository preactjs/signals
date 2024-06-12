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
		getConsoleErrorSpy().resetHistory();
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
});
