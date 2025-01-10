import { useRef, createElement, Fragment, useState } from "react";
import { Signal, signal, batch } from "@preact/signals-core";
import { useSignals } from "@preact/signals-react/runtime";
import {
	Root,
	createRoot,
	act,
	checkHangingAct,
	getConsoleErrorSpy,
} from "../../../test/shared/utils";

const MANAGED_COMPONENT = 1;
const MANAGED_HOOK = 2;

describe("useSignals", () => {
	let scratch: HTMLDivElement;
	let root: Root;

	async function render(element: Parameters<Root["render"]>[0]) {
		await act(() => root.render(element));
	}

	async function runTest(
		element: React.ReactElement,
		...signals: Signal<number>[]
	) {
		const values = signals.map(() => 0);

		await render(element);
		expect(scratch.innerHTML).to.equal(`<p>${values.join(",")}</p>`);

		for (let i = 0; i < signals.length; i++) {
			await act(() => {
				signals[i].value += 1;
			});
			values[i] += 1;
			expect(scratch.innerHTML).to.equal(`<p>${values.join(",")}</p>`);
		}

		await act(() => {
			batch(() => {
				for (let i = 0; i < signals.length; i++) {
					signals[i].value += 1;
					values[i] += 1;
				}
			});
		});
		expect(scratch.innerHTML).to.equal(`<p>${values.join(",")}</p>`);
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

	it("should rerender components when signals they use change", async () => {
		const signal1 = signal(0);
		function Child1() {
			useSignals();
			return <p>{signal1.value}</p>;
		}

		const signal2 = signal(0);
		function Child2() {
			useSignals();
			return <p>{signal2.value}</p>;
		}

		function Parent() {
			return (
				<Fragment>
					<Child1 />
					<Child2 />
				</Fragment>
			);
		}

		await render(<Parent />);
		expect(scratch.innerHTML).to.equal("<p>0</p><p>0</p>");

		await act(() => {
			signal1.value += 1;
		});
		expect(scratch.innerHTML).to.equal("<p>1</p><p>0</p>");

		await act(() => {
			signal2.value += 1;
		});
		expect(scratch.innerHTML).to.equal("<p>1</p><p>1</p>");
	});

	it("should correctly invoke rerenders if useSignals is called multiple times in the same component", async () => {
		const signal1 = signal(0);
		const signal2 = signal(0);
		const signal3 = signal(0);
		function App() {
			useSignals();
			const sig1 = signal1.value;
			useSignals();
			const sig2 = signal2.value;
			const sig3 = signal3.value;
			useSignals();
			return (
				<p>
					{sig1}
					{sig2}
					{sig3}
				</p>
			);
		}

		await render(<App />);
		expect(scratch.innerHTML).to.equal("<p>000</p>");

		await act(() => {
			signal1.value += 1;
		});
		expect(scratch.innerHTML).to.equal("<p>100</p>");

		await act(() => {
			signal2.value += 1;
		});
		expect(scratch.innerHTML).to.equal("<p>110</p>");

		await act(() => {
			signal3.value += 1;
		});
		expect(scratch.innerHTML).to.equal("<p>111</p>");
	});

	it("should not rerender components when signals they use do not change", async () => {
		const child1Spy = sinon.spy();
		const signal1 = signal(0);
		function Child1() {
			child1Spy();
			useSignals();
			return <p>{signal1.value}</p>;
		}

		const child2Spy = sinon.spy();
		const signal2 = signal(0);
		function Child2() {
			child2Spy();
			useSignals();
			return <p>{signal2.value}</p>;
		}

		const parentSpy = sinon.spy();
		function Parent() {
			parentSpy();
			return (
				<Fragment>
					<Child1 />
					<Child2 />
				</Fragment>
			);
		}

		function resetSpies() {
			child1Spy.resetHistory();
			child2Spy.resetHistory();
			parentSpy.resetHistory();
		}

		resetSpies();
		await render(<Parent />);
		expect(scratch.innerHTML).to.equal("<p>0</p><p>0</p>");
		expect(child1Spy).to.have.been.calledOnce;
		expect(child2Spy).to.have.been.calledOnce;
		expect(parentSpy).to.have.been.calledOnce;

		resetSpies();
		await act(() => {
			signal1.value += 1;
		});
		expect(scratch.innerHTML).to.equal("<p>1</p><p>0</p>");
		expect(child1Spy).to.have.been.calledOnce;
		expect(child2Spy).to.not.have.been.called;
		expect(parentSpy).to.not.have.been.called;

		resetSpies();
		await act(() => {
			signal2.value += 1;
		});
		expect(scratch.innerHTML).to.equal("<p>1</p><p>1</p>");
		expect(child1Spy).to.not.have.been.called;
		expect(child2Spy).to.have.been.calledOnce;
		expect(parentSpy).to.not.have.been.called;
	});

	it("should not rerender components when signals they use change but they are not mounted", async () => {
		const child1Spy = sinon.spy();
		const signal1 = signal(0);
		function Child() {
			child1Spy();
			useSignals();
			const sig1 = signal1.value;
			return <p>{sig1}</p>;
		}

		function Parent({ show }: { show: boolean }) {
			return <Fragment>{show && <Child />}</Fragment>;
		}

		await render(<Parent show={true} />);
		expect(scratch.innerHTML).to.equal("<p>0</p>");

		await act(() => {
			signal1.value += 1;
		});
		expect(scratch.innerHTML).to.equal("<p>1</p>");

		await act(() => {
			render(<Parent show={false} />);
		});
		expect(scratch.innerHTML).to.equal("");

		await act(() => {
			signal1.value += 1;
		});
		expect(child1Spy).to.have.been.calledTwice;
	});

	it("should not rerender components that only update signals in event handlers", async () => {
		const buttonSpy = sinon.spy();
		function AddOneButton({ num }: { num: Signal<number> }) {
			useSignals();
			buttonSpy();
			return (
				<button
					onClick={() => {
						num.value += 1;
					}}
				>
					Add One
				</button>
			);
		}

		const displaySpy = sinon.spy();
		function DisplayNumber({ num }: { num: Signal<number> }) {
			useSignals();
			displaySpy();
			return <p>{num.value}</p>;
		}

		const number = signal(0);
		function App() {
			return (
				<Fragment>
					<AddOneButton num={number} />
					<DisplayNumber num={number} />
				</Fragment>
			);
		}

		await render(<App />);
		expect(scratch.innerHTML).to.equal("<button>Add One</button><p>0</p>");
		expect(buttonSpy).to.have.been.calledOnce;
		expect(displaySpy).to.have.been.calledOnce;

		await act(() => {
			scratch.querySelector("button")!.click();
		});

		expect(scratch.innerHTML).to.equal("<button>Add One</button><p>1</p>");
		expect(buttonSpy).to.have.been.calledOnce;
		expect(displaySpy).to.have.been.calledTwice;
	});

	it("should not rerender components that only read signals in event handlers", async () => {
		const buttonSpy = sinon.spy();
		function AddOneButton({ num }: { num: Signal<number> }) {
			useSignals();
			buttonSpy();
			return (
				<button
					onClick={() => {
						num.value += adder.value;
					}}
				>
					Add One
				</button>
			);
		}

		const displaySpy = sinon.spy();
		function DisplayNumber({ num }: { num: Signal<number> }) {
			useSignals();
			displaySpy();
			return <p>{num.value}</p>;
		}

		const adder = signal(2);
		const number = signal(0);
		function App() {
			return (
				<Fragment>
					<AddOneButton num={number} />
					<DisplayNumber num={number} />
				</Fragment>
			);
		}

		function resetSpies() {
			buttonSpy.resetHistory();
			displaySpy.resetHistory();
		}

		resetSpies();
		await render(<App />);
		expect(scratch.innerHTML).to.equal("<button>Add One</button><p>0</p>");
		expect(buttonSpy).to.have.been.calledOnce;
		expect(displaySpy).to.have.been.calledOnce;

		resetSpies();
		await act(() => {
			scratch.querySelector("button")!.click();
		});

		expect(scratch.innerHTML).to.equal("<button>Add One</button><p>2</p>");
		expect(buttonSpy).to.not.have.been.called;
		expect(displaySpy).to.have.been.calledOnce;

		resetSpies();
		await act(() => {
			adder.value += 1;
		});

		expect(scratch.innerHTML).to.equal("<button>Add One</button><p>2</p>");
		expect(buttonSpy).to.not.have.been.called;
		expect(displaySpy).to.not.have.been.called;

		resetSpies();
		await act(() => {
			scratch.querySelector("button")!.click();
		});

		expect(scratch.innerHTML).to.equal("<button>Add One</button><p>5</p>");
		expect(buttonSpy).to.not.have.been.called;
		expect(displaySpy).to.have.been.calledOnce;
	});

	it("should properly rerender components that use custom hooks", async () => {
		const greeting = signal("Hello");
		function useGreeting() {
			useSignals();
			return greeting.value;
		}

		const name = signal("John");
		function useName() {
			useSignals();
			return name.value;
		}

		function App() {
			const greeting = useGreeting();
			const name = useName();
			return (
				<div>
					{greeting} {name}!
				</div>
			);
		}

		await render(<App />);
		expect(scratch.innerHTML).to.equal("<div>Hello John!</div>");

		await act(() => {
			greeting.value = "Hi";
		});
		expect(scratch.innerHTML).to.equal("<div>Hi John!</div>");

		await act(() => {
			name.value = "Jane";
		});
		expect(scratch.innerHTML).to.equal("<div>Hi Jane!</div>");

		await act(() => {
			batch(() => {
				greeting.value = "Hello";
				name.value = "John";
			});
		});
		expect(scratch.innerHTML).to.equal("<div>Hello John!</div>");
	});

	it("should properly rerender components that use custom hooks and signals", async () => {
		const greeting = signal("Hello");
		function useGreeting() {
			useSignals();
			return greeting.value;
		}

		const name = signal("John");
		function useName() {
			useSignals();
			return name.value;
		}

		const punctuation = signal("!");
		function App() {
			useSignals();
			const greeting = useGreeting();
			const name = useName();
			return (
				<div>
					{greeting} {name}
					{punctuation.value}
				</div>
			);
		}

		await render(<App />);
		expect(scratch.innerHTML).to.equal("<div>Hello John!</div>");

		await act(() => {
			greeting.value = "Hi";
		});
		expect(scratch.innerHTML).to.equal("<div>Hi John!</div>");

		await act(() => {
			name.value = "Jane";
		});
		expect(scratch.innerHTML).to.equal("<div>Hi Jane!</div>");

		await act(() => {
			punctuation.value = "?";
		});
		expect(scratch.innerHTML).to.equal("<div>Hi Jane?</div>");

		await act(() => {
			batch(() => {
				greeting.value = "Hello";
				name.value = "John";
				punctuation.value = "!";
			});
		});
		expect(scratch.innerHTML).to.equal("<div>Hello John!</div>");
	});

	it("should clean up signal dependencies after unmounting", async () => {
		const getTargets = (s: any): any => s.t ?? s._targets;

		const sig = signal(0);
		function App() {
			const effectStore = useSignals(/* MANAGED_COMPONENT */ 1);
			try {
				return <p>{sig.value}</p>;
			} finally {
				effectStore.f();
			}
		}

		expect(getTargets(sig)).to.be.undefined;

		await render(<App />);
		expect(scratch.innerHTML).to.equal("<p>0</p>");
		expect(getTargets(sig)).to.be.not.null.and.not.undefined;

		act(() => root.unmount());
		expect(scratch.innerHTML).to.equal("");

		await Promise.resolve();
		expect(getTargets(sig)).to.be.undefined;
	});

	// TODO: Figure out what to do here...
	it.skip("(managed) should work with components that use render props", async () => {
		function AutoFocusWithin({
			children,
		}: {
			children: (setRef: (...args: any[]) => void) => any;
		}) {
			const setRef = useRef(() => {}).current;
			return children(setRef);
		}

		const name = signal("John");
		function App() {
			const e = useSignals();
			try {
				return (
					<AutoFocusWithin>
						{setRef => <div ref={setRef}>Hello {name.value}</div>}
					</AutoFocusWithin>
				);
			} finally {
				e.f();
			}
		}

		await render(<App />);
		expect(scratch.innerHTML).to.equal("<div>Hello John</div>");

		await act(() => {
			name.value = "Jane";
		});
		expect(scratch.innerHTML).to.equal("<div>Hello Jane</div>");

		await act(() => {
			name.value = "John";
		});
		expect(scratch.innerHTML).to.equal("<div>Hello John</div>");
	});

	it("(unmanaged) should work with components that use render props", async () => {
		function AutoFocusWithin({
			children,
		}: {
			children: (setRef: (...args: any[]) => void) => any;
		}) {
			const setRef = useRef(() => {}).current;
			return children(setRef);
		}

		const name = signal("John");
		function App() {
			useSignals();
			return (
				<AutoFocusWithin>
					{setRef => <div ref={setRef}>Hello {name.value}</div>}
				</AutoFocusWithin>
			);
		}

		await render(<App />);
		expect(scratch.innerHTML).to.equal("<div>Hello John</div>");

		await act(() => {
			name.value = "Jane";
		});
		expect(scratch.innerHTML).to.equal("<div>Hello Jane</div>");

		await act(() => {
			name.value = "John";
		});
		expect(scratch.innerHTML).to.equal("<div>Hello John</div>");
	});

	it("(unmanaged) (React 16 specific) should work with rerenders that update signals before async final cleanup", async () => {
		// Cursed/problematic call stack that causes this error:
		// 1. onClick callback
		// 1a. call setState (queues sync work at end of event handler in React)
		// 1b. await Promise.resolve();
		// 2. React flushes sync callbacks and rerenders component
		// 2a. Start useSignals effect, set evalContext, & start batch
		// 3. Resolve promises resumes and sets signal value
		// 3a. In batch, so mark subscribers as needing update
		// 4. useSignals finalCleanup runs
		// 4a. endEffect runs and clears evalContext
		// 4aa. endBatch and call subscribers with signal update
		// 4ab. usSignals' useSyncExternalStore calls onChangeNotifyReact
		// 4ac. React sync rerenders component
		// 4ad. useSignals effect runs
		// 4ae. finishEffect called again (evalContext == null but this == effectInstance)
		// BOOM! "out-of-order effect" Error thrown

		const count = signal(0);

		function C() {
			useSignals();
			const [, setState] = useState(false);

			const onClick = async () => {
				setState(true);
				await Promise.resolve();
				count.value += 1;
				// Note, don't set state here cuz it'll cause an early rerender that
				// won't trigger the bug. The rerender needs to happen during the
				// finalCleanup's call to endEffect.
			};

			return (
				<>
					<p>{count.value}</p>
					<button onClick={onClick}>increment</button>
				</>
			);
		}

		await render(<C />);
		expect(scratch.innerHTML).to.equal("<p>0</p><button>increment</button>");

		await act(() => {
			scratch.querySelector("button")!.click();
		});
		expect(scratch.innerHTML).to.equal(`<p>1</p><button>increment</button>`);
	});

	describe("using hooks that call useSignal in components that call useSignals", () => {
		let unmanagedHookSignal = signal(0);
		function useUnmanagedHook() {
			useSignals();
			return unmanagedHookSignal.value;
		}

		let managedHookSignal = signal(0);
		function useManagedHook() {
			const e = useSignals(MANAGED_HOOK);
			try {
				return managedHookSignal.value;
			} finally {
				e.f();
			}
		}

		let componentSignal = signal(0);
		function ManagedComponent({ hooks }: { hooks: Array<() => number> }) {
			const e = useSignals(MANAGED_COMPONENT);
			try {
				const componentValue = componentSignal;
				const hookValues = hooks.map(hook => hook());
				return <p>{[componentValue, ...hookValues].join(",")}</p>;
			} finally {
				e.f();
			}
		}

		function UnmanagedComponent({ hooks }: { hooks: Array<() => number> }) {
			useSignals();
			const componentValue = componentSignal;
			const hookValues = hooks.map(hook => hook());
			return <p>{[componentValue, ...hookValues].join(",")}</p>;
		}

		beforeEach(() => {
			componentSignal = signal(0);
			unmanagedHookSignal = signal(0);
			managedHookSignal = signal(0);
		});

		[ManagedComponent, UnmanagedComponent].forEach(Component => {
			const componentName = Component.name;

			it(`${componentName} > managed hook`, async () => {
				await runTest(
					<Component hooks={[useManagedHook]} />,
					componentSignal,
					managedHookSignal
				);
			});

			it(`${componentName} > unmanaged hook`, async () => {
				await runTest(
					<Component hooks={[useUnmanagedHook]} />,
					componentSignal,
					unmanagedHookSignal
				);
			});
		});

		[ManagedComponent, UnmanagedComponent].forEach(Component => {
			const componentName = Component.name;

			it(`${componentName} > managed hook + managed hook`, async () => {
				let managedHookSignal2 = signal(0);
				function useManagedHook2() {
					const e = useSignals(MANAGED_HOOK);
					try {
						return managedHookSignal2.value;
					} finally {
						e.f();
					}
				}

				await runTest(
					<Component hooks={[useManagedHook, useManagedHook2]} />,
					componentSignal,
					managedHookSignal,
					managedHookSignal2
				);
			});

			it(`${componentName} > managed hook + unmanaged hook`, async () => {
				await runTest(
					<Component hooks={[useManagedHook, useUnmanagedHook]} />,
					componentSignal,
					managedHookSignal,
					unmanagedHookSignal
				);
			});

			it(`${componentName} > unmanaged hook + managed hook`, async () => {
				await runTest(
					<Component hooks={[useUnmanagedHook, useManagedHook]} />,
					componentSignal,
					unmanagedHookSignal,
					managedHookSignal
				);
			});

			it(`${componentName} > unmanaged hook + unmanaged hook`, async () => {
				let unmanagedHookSignal2 = signal(0);
				function useUnmanagedHook2() {
					useSignals();
					return unmanagedHookSignal2.value;
				}

				await runTest(
					<Component hooks={[useUnmanagedHook, useUnmanagedHook2]} />,
					componentSignal,
					unmanagedHookSignal,
					unmanagedHookSignal2
				);
			});
		});
	});

	describe("using nested hooks that each call useSignals in components that call useSignals", () => {
		type UseHookValProps = { useHookVal: () => number[] };

		let componentSignal = signal(0);
		function ManagedComponent({ useHookVal }: UseHookValProps) {
			const e = useSignals(MANAGED_COMPONENT);
			try {
				const val1 = componentSignal.value;
				const hookVal = useHookVal();
				return <p>{[val1, ...hookVal].join(",")}</p>;
			} finally {
				e.f();
			}
		}

		function UnmanagedComponent({ useHookVal }: UseHookValProps) {
			useSignals();
			const val1 = componentSignal.value;
			const hookVal = useHookVal();
			return <p>{[val1, ...hookVal].join(",")}</p>;
		}

		beforeEach(() => {
			componentSignal = signal(0);
		});

		[ManagedComponent, UnmanagedComponent].forEach(Component => {
			const componentName = Component.name;

			it(`${componentName} > managed hook > managed hook`, async () => {
				let managedHookSignal2 = signal(0);
				function useManagedHook() {
					const e = useSignals(MANAGED_HOOK);
					try {
						return managedHookSignal2.value;
					} finally {
						e.f();
					}
				}

				let managedHookSignal1 = signal(0);
				function useManagedManagedHook() {
					const e = useSignals(MANAGED_HOOK);
					try {
						const nestedVal = useManagedHook();
						return [managedHookSignal1.value, nestedVal];
					} finally {
						e.f();
					}
				}

				await runTest(
					<Component useHookVal={useManagedManagedHook} />,
					componentSignal,
					managedHookSignal1,
					managedHookSignal2
				);
			});

			it(`${componentName} > managed hook > unmanaged hook`, async () => {
				let unmanagedHookSignal = signal(0);
				function useUnmanagedHook() {
					useSignals();
					return unmanagedHookSignal.value;
				}

				let managedHookSignal = signal(0);
				function useManagedUnmanagedHook() {
					const e = useSignals(MANAGED_HOOK);
					try {
						const nestedVal = useUnmanagedHook();
						return [managedHookSignal.value, nestedVal];
					} finally {
						e.f();
					}
				}

				await runTest(
					<Component useHookVal={useManagedUnmanagedHook} />,
					componentSignal,
					managedHookSignal,
					unmanagedHookSignal
				);
			});

			it(`${componentName} > unmanaged hook > managed hook`, async () => {
				let managedHookSignal = signal(0);
				function useManagedHook() {
					const e = useSignals(MANAGED_HOOK);
					try {
						return managedHookSignal.value;
					} finally {
						e.f();
					}
				}

				let unmanagedHookSignal = signal(0);
				function useUnmanagedManagedHook() {
					useSignals();
					const nestedVal = useManagedHook();
					return [unmanagedHookSignal.value, nestedVal];
				}

				await runTest(
					<Component useHookVal={useUnmanagedManagedHook} />,
					componentSignal,
					unmanagedHookSignal,
					managedHookSignal
				);
			});

			it(`${componentName} > unmanaged hook > unmanaged hook`, async () => {
				let unmanagedHookSignal2 = signal(0);
				function useUnmanagedHook() {
					useSignals();
					return unmanagedHookSignal2.value;
				}

				let unmanagedHookSignal1 = signal(0);
				function useUnmanagedUnmanagedHook() {
					useSignals();
					const nestedVal = useUnmanagedHook();
					return [unmanagedHookSignal1.value, nestedVal];
				}

				await runTest(
					<Component useHookVal={useUnmanagedUnmanagedHook} />,
					componentSignal,
					unmanagedHookSignal1,
					unmanagedHookSignal2
				);
			});
		});
	});
});
