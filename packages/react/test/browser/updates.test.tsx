// @ts-ignore-next-line
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import {
	signal,
	computed,
	useComputed,
	useSignalEffect,
	useSignal,
	Signal,
} from "@preact/signals-react";
import {
	createElement,
	Fragment,
	forwardRef,
	useMemo,
	useReducer,
	memo,
	StrictMode,
	createRef,
	useState,
	useContext,
	createContext,
} from "react";

import { renderToStaticMarkup } from "react-dom/server";
import {
	createRoot,
	Root,
	act,
	checkHangingAct,
	isReact16,
	isProd,
	getConsoleErrorSpy,
	checkConsoleErrorLogs,
} from "../shared/utils";

describe("@preact/signals-react updating", () => {
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

		checkConsoleErrorLogs();
		checkHangingAct();
	});

	describe("SignalValue bindings", () => {
		it("should render text without signals", async () => {
			await render(<span>test</span>);
			const span = scratch.firstChild;
			const text = span?.firstChild;
			expect(text).to.have.property("data", "test");
		});

		it("should render Signals as SignalValue", async () => {
			const sig = signal("test");
			await render(<span>{sig}</span>);
			const span = scratch.firstChild;
			expect(span).to.have.property("firstChild").that.is.an.instanceOf(Text);
			const text = span?.firstChild;
			expect(text).to.have.property("data", "test");
		});

		it("should render computed as SignalValue", async () => {
			const sig = signal("test");
			const comp = computed(() => `${sig} ${sig}`);
			await render(<span>{comp}</span>);
			const span = scratch.firstChild;
			expect(span).to.have.property("firstChild").that.is.an.instanceOf(Text);
			const text = span?.firstChild;
			expect(text).to.have.property("data", "test test");
		});

		it("should update Signal-based SignalValue (no parent component)", async () => {
			const sig = signal("test");
			await render(<span>{sig}</span>);

			const text = scratch.firstChild!.firstChild!;
			expect(text).to.have.property("data", "test");

			await act(() => {
				sig.value = "changed";
			});

			// should not remount/replace SignalValue
			expect(scratch.firstChild!.firstChild!).to.equal(text);
			// should update the text in-place
			expect(text).to.have.property("data", "changed");
		});

		it("should update Signal-based SignalValue (in a parent component)", async () => {
			const sig = signal("test");
			function App({ x }: { x: typeof sig }) {
				return <span>{x}</span>;
			}
			await render(<App x={sig} />);

			const text = scratch.firstChild!.firstChild!;
			expect(text).to.have.property("data", "test");

			await act(() => {
				sig.value = "changed";
			});

			// should not remount/replace SignalValue
			expect(scratch.firstChild!.firstChild!).to.equal(text);
			// should update the text in-place
			expect(text).to.have.property("data", "changed");
		});

		it("should work with JSX inside signal", async () => {
			const sig = signal(<b>test</b>);
			function App({ x }: { x: typeof sig }) {
				return <span>{x}</span>;
			}
			await render(<App x={sig} />);

			let text = scratch.firstChild!.firstChild!;
			expect(text).to.be.instanceOf(HTMLElement);
			expect(text.firstChild).to.have.property("data", "test");

			await act(() => {
				sig.value = <div>changed</div>;
			});

			text = scratch.firstChild!.firstChild!;
			expect(text).to.be.instanceOf(HTMLDivElement);
			expect(text.firstChild).to.have.property("data", "changed");
		});
	});

	describe("Component bindings", () => {
		it("should subscribe to signals", async () => {
			const sig = signal("foo");

			function App() {
				const value = sig.value;
				return <p>{value}</p>;
			}

			await render(<App />);
			expect(scratch.textContent).to.equal("foo");

			await act(() => {
				sig.value = "bar";
			});
			expect(scratch.textContent).to.equal("bar");
		});

		it("should rerender components when signals they use change", async () => {
			const signal1 = signal(0);
			function Child1() {
				return <div>{signal1}</div>;
			}

			const signal2 = signal(0);
			function Child2() {
				return <div>{signal2}</div>;
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
			expect(scratch.innerHTML).to.equal("<div>0</div><div>0</div>");

			await act(() => {
				signal1.value += 1;
			});
			expect(scratch.innerHTML).to.equal("<div>1</div><div>0</div>");

			await act(() => {
				signal2.value += 1;
			});
			expect(scratch.innerHTML).to.equal("<div>1</div><div>1</div>");
		});

		it("should subscribe to signals passed as props to DOM elements", async () => {
			const className = signal("foo");
			function App() {
				// @ts-expect-error React types don't allow signals on DOM elements :/
				return <div className={className} />;
			}

			await render(<App />);

			expect(scratch.innerHTML).to.equal('<div class="foo"></div>');

			await act(() => {
				className.value = "bar";
			});

			expect(scratch.innerHTML).to.equal('<div class="bar"></div>');
		});

		it("should activate signal accessed in render", async () => {
			const sig = signal(null);

			function App() {
				const arr = useComputed(() => {
					// trigger read
					sig.value;

					return [];
				});

				const str = arr.value.join(", ");
				return <p>{str}</p>;
			}

			try {
				await render(<App />);
			} catch (e: any) {
				expect.fail(e.stack);
			}
		});

		it("should not subscribe to child signals", async () => {
			const sig = signal("foo");

			function Child() {
				const value = sig.value;
				return <p>{value}</p>;
			}

			const spy = sinon.spy();
			function App() {
				spy();
				return <Child />;
			}

			await render(<App />);
			expect(scratch.textContent).to.equal("foo");

			await act(() => {
				sig.value = "bar";
			});
			expect(spy).to.be.calledOnce;
		});

		it("should update memo'ed component via signals", async () => {
			const sig = signal("foo");

			function Inner() {
				const value = sig.value;
				return <p>{value}</p>;
			}

			function App() {
				sig.value;
				return useMemo(() => <Inner />, []);
			}

			await render(<App />);
			expect(scratch.textContent).to.equal("foo");

			await act(() => {
				sig.value = "bar";
			});
			expect(scratch.textContent).to.equal("bar");
		});

		it("should update forwardRef'ed component via signals", async () => {
			const sig = signal("foo");

			const Inner = forwardRef(() => {
				return <p>{sig.value}</p>;
			});

			function App() {
				return <Inner />;
			}

			await render(<App />);
			expect(scratch.textContent).to.equal("foo");

			await act(() => {
				sig.value = "bar";
			});
			expect(scratch.textContent).to.equal("bar");
		});

		it("should consistently rerender in strict mode", async () => {
			const sig = signal(-1);

			const Test = () => <p>{sig.value}</p>;
			const App = () => (
				<StrictMode>
					<Test />
				</StrictMode>
			);

			await render(<App />);
			expect(scratch.textContent).to.equal("-1");

			for (let i = 0; i < 3; i++) {
				await act(async () => {
					sig.value = i;
				});
				expect(scratch.textContent).to.equal("" + i);
			}
		});

		it("should consistently rerender in strict mode (with memo)", async () => {
			const sig = signal(-1);

			const Test = memo(() => <p>{sig.value}</p>);
			const App = () => (
				<StrictMode>
					<Test />
				</StrictMode>
			);

			await render(<App />);
			expect(scratch.textContent).to.equal("-1");

			for (let i = 0; i < 3; i++) {
				await act(async () => {
					sig.value = i;
				});
				expect(scratch.textContent).to.equal("" + i);
			}
		});

		it("should render static markup of a component", async () => {
			const count = signal(0);

			const Test = () => {
				return (
					<pre>
						{renderToStaticMarkup(<code>{count}</code>)}
						{renderToStaticMarkup(<code>{count.value}</code>)}
					</pre>
				);
			};

			await render(<Test />);
			expect(scratch.textContent).to.equal("<code>0</code><code>0</code>");

			for (let i = 0; i < 3; i++) {
				await act(async () => {
					count.value += 1;
				});
				expect(scratch.textContent).to.equal(
					`<code>${count.value}</code><code>${count.value}</code>`
				);
			}
		});

		it("should correctly render components that have useReducer()", async () => {
			const count = signal(0);

			let increment: () => void;
			const Test = () => {
				const [state, dispatch] = useReducer(
					(state: number, action: number) => {
						return state + action;
					},
					-2
				);

				increment = () => dispatch(1);

				const doubled = count.value * 2;

				return (
					<pre>
						<code>{state}</code>
						<code>{doubled}</code>
					</pre>
				);
			};

			await render(<Test />);
			expect(scratch.innerHTML).to.equal(
				"<pre><code>-2</code><code>0</code></pre>"
			);

			for (let i = 0; i < 3; i++) {
				await act(async () => {
					count.value += 1;
				});
				expect(scratch.innerHTML).to.equal(
					`<pre><code>-2</code><code>${count.value * 2}</code></pre>`
				);
			}

			await act(() => {
				increment();
			});
			expect(scratch.innerHTML).to.equal(
				`<pre><code>-1</code><code>${count.value * 2}</code></pre>`
			);
		});

		it("should not fail when a component calls setState while rendering", async () => {
			let increment: () => void;
			function App() {
				const [state, setState] = useState(0);
				increment = () => setState(state + 1);

				if (state > 0 && state < 2) {
					setState(state + 1);
				}

				return <div>{state}</div>;
			}

			await render(<App />);
			expect(scratch.innerHTML).to.equal("<div>0</div>");

			await act(() => {
				increment();
			});
			expect(scratch.innerHTML).to.equal("<div>2</div>");
		});

		it("should not fail when a component calls setState multiple times while rendering", async () => {
			let increment: () => void;
			function App() {
				const [state, setState] = useState(0);
				increment = () => setState(state + 1);

				if (state > 0 && state < 5) {
					setState(state + 1);
				}

				return <div>{state}</div>;
			}

			await render(<App />);
			expect(scratch.innerHTML).to.equal("<div>0</div>");

			await act(() => {
				increment();
			});
			expect(scratch.innerHTML).to.equal("<div>5</div>");
		});

		it("should not fail when a component only uses state-less hooks", async () => {
			// This test is suppose to trigger a condition in React where the
			// HooksDispatcherOnMountWithHookTypesInDEV is used. This dispatcher is
			// used in the development build of React if a component has hook types
			// defined but no memoizedState, meaning no stateful hooks (e.g. useState)
			// are used. `useContext` is an example of a state-less hook because it
			// does not mount any hook state onto the fiber's memoizedState field.
			//
			// However, as of writing, because our react adapter inserts a
			// useSyncExternalStore into all components, all components have memoized
			// state and so this condition is never hit. However, I'm leaving the test
			// to capture this unique behavior to hopefully catch any errors caused by
			// not understanding or handling this in the future.

			const sig = signal(0);
			const MyContext = createContext(0);

			function Child() {
				const value = useContext(MyContext);
				return (
					<div>
						{sig} {value}
					</div>
				);
			}

			let updateContext: () => void;
			function App() {
				const [value, setValue] = useState(0);
				updateContext = () => setValue(value + 1);

				return (
					<MyContext.Provider value={value}>
						<Child />
					</MyContext.Provider>
				);
			}

			await render(<App />);
			expect(scratch.innerHTML).to.equal("<div>0 0</div>");

			await act(() => {
				sig.value++;
			});
			expect(scratch.innerHTML).to.equal("<div>1 0</div>");

			await act(() => {
				updateContext();
			});
			expect(scratch.innerHTML).to.equal("<div>1 1</div>");
		});

		it("should not subscribe to computed signals only created and not used", async () => {
			const sig = signal(0);
			const childSpy = sinon.spy();
			const parentSpy = sinon.spy();

			function Child({ num }: { num: Signal<number> }) {
				childSpy();
				return <p>{num.value}</p>;
			}

			function Parent({ num }: { num: Signal<number> }) {
				parentSpy();
				const sig2 = useComputed(() => num.value + 1);
				return <Child num={sig2} />;
			}

			await render(<Parent num={sig} />);
			expect(scratch.innerHTML).to.equal("<p>1</p>");
			expect(parentSpy).to.be.calledOnce;
			expect(childSpy).to.be.calledOnce;

			await act(() => {
				sig.value += 1;
			});
			expect(scratch.innerHTML).to.equal("<p>2</p>");
			expect(parentSpy).to.be.calledOnce;
			expect(childSpy).to.be.calledTwice;
		});

		it("should properly subscribe and unsubscribe to conditionally rendered computed signals ", async () => {
			const computedDep = signal(0);
			const renderComputed = signal(true);
			const renderSpy = sinon.spy();

			function App() {
				renderSpy();
				const computed = useComputed(() => computedDep.value + 1);
				return renderComputed.value ? <p>{computed.value}</p> : null;
			}

			await render(<App />);
			expect(scratch.innerHTML).to.equal("<p>1</p>");
			expect(renderSpy).to.be.calledOnce;

			await act(() => {
				computedDep.value += 1;
			});
			expect(scratch.innerHTML).to.equal("<p>2</p>");
			expect(renderSpy).to.be.calledTwice;

			await act(() => {
				renderComputed.value = false;
			});
			expect(scratch.innerHTML).to.equal("");
			expect(renderSpy).to.be.calledThrice;

			await act(() => {
				computedDep.value += 1;
			});
			expect(scratch.innerHTML).to.equal("");
			expect(renderSpy).to.be.calledThrice; // Should not be called again
		});
	});

	describe("useSignal()", () => {
		it("should create a signal from a primitive value", async () => {
			function App() {
				const count = useSignal(1);
				return (
					<div>
						{count}
						<button onClick={() => count.value++}>Increment</button>
					</div>
				);
			}

			await render(<App />);
			expect(scratch.textContent).to.equal("1Increment");

			await act(() => {
				scratch.querySelector("button")!.click();
			});
			expect(scratch.textContent).to.equal("2Increment");
		});
	});

	describe("useSignalEffect()", () => {
		it("should be invoked after commit", async () => {
			const ref = createRef<HTMLDivElement>();
			const sig = signal("foo");
			const spy = sinon.spy();
			let count = 0;

			function App() {
				useSignalEffect(() =>
					spy(
						sig.value,
						ref.current,
						ref.current!.getAttribute("data-render-id")
					)
				);
				return (
					<p ref={ref} data-render-id={count++}>
						{sig.value}
					</p>
				);
			}

			await render(<App />);
			expect(scratch.textContent).to.equal("foo");

			expect(spy).to.have.been.calledOnceWith(
				"foo",
				scratch.firstElementChild,
				"0"
			);

			spy.resetHistory();

			await act(() => {
				sig.value = "bar";
			});

			expect(scratch.textContent).to.equal("bar");

			// NOTE: Ideally, call should receive "1" as its third argument! The "0"
			// indicates that React's DOM mutations hadn't yet been performed when the
			// callback ran. This happens because we do signal-based effect runs after
			// the first, not VDOM. Perhaps we could find a way to defer the callback
			// when it coincides with a render? In React 16 when running in production
			// however, we do see "1" as expected, likely because we are using a fake
			// act() implementation which completes after the DOM has been updated.
			expect(spy).to.have.been.calledOnceWith(
				"bar",
				scratch.firstElementChild,
				isReact16 && isProd ? "1" : "0" // ideally always "1" - update if we find a nice way to do so!
			);
		});

		it("should invoke any returned cleanup function for updates", async () => {
			const ref = createRef<HTMLDivElement>();
			const sig = signal("foo");
			const spy = sinon.spy();
			const cleanup = sinon.spy();
			let count = 0;

			function App() {
				useSignalEffect(() => {
					const id = ref.current!.getAttribute("data-render-id");
					const value = sig.value;
					spy(value, ref.current, id);
					return () => cleanup(value, ref.current, id);
				});
				return (
					<p ref={ref} data-render-id={count++}>
						{sig.value}
					</p>
				);
			}

			await render(<App />);

			expect(cleanup).not.to.have.been.called;
			expect(spy).to.have.been.calledOnceWith(
				"foo",
				scratch.firstElementChild,
				"0"
			);
			spy.resetHistory();

			await act(() => {
				sig.value = "bar";
			});

			expect(scratch.textContent).to.equal("bar");

			const child = scratch.firstElementChild;

			expect(cleanup).to.have.been.calledOnceWith("foo", child, "0");

			expect(spy).to.have.been.calledOnceWith(
				"bar",
				child,
				isReact16 && isProd ? "1" : "0" // ideally always "1" - update if we find a nice way to do so!
			);
		});

		it("should invoke any returned cleanup function for unmounts", async () => {
			const ref = createRef<HTMLDivElement>();
			const sig = signal("foo");
			const spy = sinon.spy();
			const cleanup = sinon.spy();

			function App() {
				useSignalEffect(() => {
					const value = sig.value;
					spy(value, ref.current);
					return () => cleanup(value, ref.current);
				});
				return <p ref={ref}>{sig.value}</p>;
			}

			await render(<App />);

			const child = scratch.firstElementChild;

			expect(scratch.innerHTML).to.equal("<p>foo</p>");
			expect(cleanup).not.to.have.been.called;
			expect(spy).to.have.been.calledOnceWith("foo", child);
			spy.resetHistory();

			await act(() => {
				root.unmount();
			});

			expect(scratch.innerHTML).to.equal("");
			expect(spy).not.to.have.been.called;
			expect(cleanup).to.have.been.calledOnce;
			// @note: React v18 cleans up the ref eagerly, so it's already null by the
			// time the callback runs. this is probably worth fixing at some point.
			expect(cleanup).to.have.been.calledWith("foo", isReact16 ? child : null);
		});
	});
});
