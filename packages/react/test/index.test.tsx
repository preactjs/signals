// @ts-ignore-next-line
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { signal, useComputed, useWatcher } from "@preact/signals-react";
import { createElement, useMemo, memo, StrictMode } from "react";
import { createRoot, Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react-dom/test-utils";

describe("@preact/signals-react", () => {
	let scratch: HTMLDivElement;
	let root: Root;
	function render(element: Parameters<Root["render"]>[0]) {
		act(() => root.render(element));
	}

	beforeEach(() => {
		scratch = document.createElement("div");
		root = createRoot(scratch);
	});

	afterEach(() => {
		act(() => root.unmount());
	});

	describe("Text bindings", () => {
		it("should render text without signals", () => {
			render(<span>test</span>);
			const span = scratch.firstChild;
			const text = span?.firstChild;
			expect(text).to.have.property("data", "test");
		});

		it("should render Signals as Text", () => {
			const sig = signal("test");
			render(<span>{sig}</span>);
			const span = scratch.firstChild;
			expect(span).to.have.property("firstChild").that.is.an.instanceOf(Text);
			const text = span?.firstChild;
			expect(text).to.have.property("data", "test");
		});

		it("should update Signal-based Text (no parent component)", () => {
			const sig = signal("test");
			render(<span>{sig}</span>);

			const text = scratch.firstChild!.firstChild!;
			expect(text).to.have.property("data", "test");

			act(() => {
				sig.value = "changed";
			});

			// should not remount/replace Text
			expect(scratch.firstChild!.firstChild!).to.equal(text);
			// should update the text in-place
			expect(text).to.have.property("data", "changed");
		});

		it("should update Signal-based Text (in a parent component)", () => {
			const sig = signal("test");
			function App({ x }: { x: typeof sig }) {
				return <span>{x}</span>;
			}
			render(<App x={sig} />);

			const text = scratch.firstChild!.firstChild!;
			expect(text).to.have.property("data", "test");

			act(() => {
				sig.value = "changed";
			});

			// should not remount/replace Text
			expect(scratch.firstChild!.firstChild!).to.equal(text);
			// should update the text in-place
			expect(text).to.have.property("data", "changed");
		});
	});

	describe("Component bindings", () => {
		it("should subscribe to signals", () => {
			const sig = signal("foo");

			function App() {
				const value = sig.value;
				return <p>{value}</p>;
			}

			render(<App />);
			expect(scratch.textContent).to.equal("foo");

			act(() => {
				sig.value = "bar";
			});
			expect(scratch.textContent).to.equal("bar");
		});

		it("should activate signal accessed in render", () => {
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

			const fn = () => render(<App />);
			expect(fn).not.to.throw;
		});

		it("should not subscribe to child signals", () => {
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

			render(<App />);
			expect(scratch.textContent).to.equal("foo");

			act(() => {
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
				return useMemo(() => <Inner foo={1} />, []);
			}

			render(<App />);
			expect(scratch.textContent).to.equal("foo");

			act(() => {
				sig.value = "bar";
			});
			expect(scratch.textContent).to.equal("bar");
		});

		it("should consistently rerender in strict mode", async () => {
			const sig = signal<string>(null!);

			const Test = () => <p>{sig.value}</p>;
			const App = () => (
				<StrictMode>
					<Test />
				</StrictMode>
			);

			for (let i = 0; i < 3; i++) {
				const value = `${i}`;

				act(() => {
					sig.value = value;
					render(<App />);
				});
				expect(scratch.textContent).to.equal(value);
			}
		});
		it("should consistently rerender in strict mode (with memo)", async () => {
			const sig = signal<string>(null!);

			const Test = memo(() => <p>{sig.value}</p>);
			const App = () => (
				<StrictMode>
					<Test />
				</StrictMode>
			);

			for (let i = 0; i < 3; i++) {
				const value = `${i}`;

				act(() => {
					sig.value = value;
					render(<App />);
				});
				expect(scratch.textContent).to.equal(value);
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
			for (let i = 0; i < 3; i++) {
				act(() => {
					count.value += 1;
					render(<Test />);
				});
				expect(scratch.textContent).to.equal(
					`<code>${count.value}</code><code>${count.value}</code>`
				);
			}
		});
	});

	describe("use watcher hook", () => {
		it("should set the initial value of the checked property", () => {
			function App({ value = 0 }) {
				const $value = useWatcher(value);
				return <span>{$value}</span>;
			}

			render(<App value={1} />);
			expect(scratch.textContent).to.equal("1");
		});

		it("should update the checked property on change", () => {
			function App({ value = 0 }) {
				const $value = useWatcher(value);
				return <span>{$value}</span>;
			}

			render(<App value={1} />);
			expect(scratch.textContent).to.equal("1");

			render(<App value={4} />);
			expect(scratch.textContent).to.equal("4");
		});

		it("should update computed signal", () => {
			function App({ value = 0 }) {
				const $value = useWatcher(value);
				const timesTwo = useComputed(() => $value.value * 2);
				return <span>{timesTwo}</span>;
			}

			render(<App value={1} />);
			expect(scratch.textContent).to.equal("2");

			render(<App value={4} />);
			expect(scratch.textContent).to.equal("8");
		});

		it("should consistently rerender in strict mode", () => {
			function Test({ value }: { value: number }) {
				const $value = useWatcher(value);
				return <span>{$value}</span>;
			}

			function App({ value = 0 }) {
				return (
					<StrictMode>
						<Test value={value} />
					</StrictMode>
				);
			}

			for (let i = 0; i < 3; ++i) {
				render(<App value={i} />);
				expect(scratch.textContent).is.equal(`${i}`);
			}
		});

		it("should not cascade rerenders", () => {
			const spy = sinon.spy();
			function App({ value = 0 }) {
				const $value = useWatcher(value);
				const timesTwo = useComputed(() => $value.value * 2);
				spy();
				return <p>{timesTwo.value}</p>;
			}

			render(<App value={1} />);
			render(<App value={4} />);

			expect(spy).to.be.calledTwice;
		});

		it("should update all silblings", () => {
			function Test({ value }: { value: number }) {
				const $value = useWatcher(value);
				return <span>{$value.value}</span>;
			}

			function App({ value = 0 }) {
				return (
					<div>
						<Test value={value} />
						<Test value={value} />
					</div>
				);
			}

			const firstChild = () => scratch.firstChild?.firstChild;

			render(<App value={1} />);
			expect(firstChild()?.textContent).to.be.equal("1");
			expect(firstChild()?.nextSibling?.textContent).to.be.equal("1");

			render(<App value={4} />);
			expect(firstChild()?.textContent).to.be.equal("4");
			expect(firstChild()?.nextSibling?.textContent).to.be.equal("4");
		});

		it("should not rerender siblings", () => {
			const spy = sinon.spy();
			function Test({ value }: { value: number }) {
				const $value = useWatcher(value);
				spy();
				return <span>{$value.value}</span>;
			}

			function App({ value = 0 }) {
				return (
					<div>
						<Test value={value} />
						<Test value={value} />
					</div>
				);
			}

			render(<App value={1} />);
			render(<App value={4} />);

			expect(spy).to.be.callCount(4);
		});
	});
});
