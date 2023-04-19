// @ts-ignore-next-line
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import {
	signal,
	computed,
	useComputed,
	useSignalEffect,
	useSignal,
} from "@preact/signals-react";
import {
	createElement,
	forwardRef,
	useMemo,
	useReducer,
	memo,
	StrictMode,
	createRef,
	useState,
} from "react";

import { renderToStaticMarkup } from "react-dom/server";
import {
	createRoot,
	Root,
	act,
	checkHangingAct,
	isReact16,
	isProd,
	consoleFormat,
	getConsoleErrorSpy,
} from "../shared/utils";

describe("@preact/signals-react updating", () => {
	let scratch: HTMLDivElement;
	let root: Root;
	const errorSpy = getConsoleErrorSpy();

	async function render(element: Parameters<Root["render"]>[0]) {
		await act(() => root.render(element));
	}

	beforeEach(async () => {
		scratch = document.createElement("div");
		document.body.appendChild(scratch);
		root = await createRoot(scratch);
		errorSpy.resetHistory();
	});

	afterEach(async () => {
		checkHangingAct();
		await act(() => root.unmount());
		scratch.remove();

		if (errorSpy.called) {
			let message: string;
			if (errorSpy.firstCall.args[0].toString().includes("%s")) {
				message = consoleFormat(...errorSpy.firstCall.args);
			} else {
				message = errorSpy.firstCall.args.join(" ");
			}

			// Ignore errors for timeouts of tests that often happen while debugging
			if (!message.includes("async tests and hooks,")) {
				expect.fail(
					`Console.error was unexpectedly called with this message: \n${message}`
				);
			}
		}
	});

	describe("Text bindings", () => {
		it("should render text without signals", async () => {
			await render(<span>test</span>);
			const span = scratch.firstChild;
			const text = span?.firstChild;
			expect(text).to.have.property("data", "test");
		});

		it("should render Signals as Text", async () => {
			const sig = signal("test");
			await render(<span>{sig}</span>);
			const span = scratch.firstChild;
			expect(span).to.have.property("firstChild").that.is.an.instanceOf(Text);
			const text = span?.firstChild;
			expect(text).to.have.property("data", "test");
		});

		it("should render computed as Text", async () => {
			const sig = signal("test");
			const comp = computed(() => `${sig} ${sig}`);
			await render(<span>{comp}</span>);
			const span = scratch.firstChild;
			expect(span).to.have.property("firstChild").that.is.an.instanceOf(Text);
			const text = span?.firstChild;
			expect(text).to.have.property("data", "test test");
		});

		it("should update Signal-based Text (no parent component)", async () => {
			const sig = signal("test");
			await render(<span>{sig}</span>);

			const text = scratch.firstChild!.firstChild!;
			expect(text).to.have.property("data", "test");

			await act(() => {
				sig.value = "changed";
			});

			// should not remount/replace Text
			expect(scratch.firstChild!.firstChild!).to.equal(text);
			// should update the text in-place
			expect(text).to.have.property("data", "changed");
		});

		it("should update Signal-based Text (in a parent component)", async () => {
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

			// should not remount/replace Text
			expect(scratch.firstChild!.firstChild!).to.equal(text);
			// should update the text in-place
			expect(text).to.have.property("data", "changed");
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
			function App() {
				const [state, setState] = useState(0);
				if (state == 0) {
					setState(1);
				}

				return <div>{state}</div>;
			}

			await render(<App />);
			expect(scratch.innerHTML).to.equal("<div>1</div>");
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
