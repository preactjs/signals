// @ts-ignore-next-line
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { expect } from "chai";
import { getConsoleErrorSpy, checkConsoleErrorLogs } from "../utils";
import { SignalLibrary, VDomLibrary } from "../types";

export function mountSignalsTests(
	vdomLibrary: VDomLibrary,
	signalLibrary: SignalLibrary,
	render: (element: JSX.Element) => string | Promise<string>
) {
	const { createElement, useReducer, useState } = vdomLibrary;
	const { signal, computed, useComputed, useSignal } = signalLibrary;

	beforeEach(async () => {
		getConsoleErrorSpy().resetHistory();
	});

	afterEach(async () => {
		checkConsoleErrorLogs();
	});

	describe("mount text bindings", () => {
		it("should render text without signals", async () => {
			const html = await render(<span>test</span>);
			expect(html).to.equal("<span>test</span>");
		});

		it("should render Signals as Text", async () => {
			const sig = signal("test");
			const html = await render(<span>{sig}</span>);
			expect(html).to.equal("<span>test</span>");
		});

		it("should render computed as Text", async () => {
			const sig = signal("test");
			const comp = computed(() => `${sig} ${sig}`);
			const html = await render(<span>{comp}</span>);
			expect(html).to.equal("<span>test test</span>");
		});

		it("should render numbers as text", async () => {
			const sig = signal(0);
			const html = await render(<p>{sig}</p>);
			expect(html).to.equal("<p>0</p>");
		});

		it("should not render booleans", async () => {
			const a = signal(true);
			const b = signal(false);
			const html = await render(
				<div>
					<p>{a}</p>
					<p>{b}</p>
				</div>
			);
			expect(html).to.equal("<div><p></p><p></p></div>");
		});
	});

	describe("mount component bindings", () => {
		it("should mount component with signals as text", async () => {
			const sig = signal("foo");

			function App() {
				const value = sig.value;
				return <p>{value}</p>;
			}

			const html = await render(<App />);
			expect(html).to.equal("<p>foo</p>");
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

		it("should correctly mount components that have useReducer()", async () => {
			const count = signal(0);

			const Test = () => {
				const [state] = useReducer((state: number, action: number) => {
					return state + action;
				}, -2);

				const doubled = count.value * 2;

				return (
					<pre>
						<code>{state}</code>
						<code>{doubled}</code>
					</pre>
				);
			};

			const html = await render(<Test />);
			expect(html).to.equal("<pre><code>-2</code><code>0</code></pre>");
		});

		it("should not fail when a component calls setState while mounting", async () => {
			function App() {
				const [state, setState] = useState(0);
				if (state == 0) {
					setState(1);
				}

				return <div>{state}</div>;
			}

			const html = await render(<App />);
			expect(html).to.equal("<div>1</div>");
		});

		it("should not fail when a component calls setState multiple times while mounting", async () => {
			function App() {
				const [state, setState] = useState(0);
				if (state < 5) {
					setState(state + 1);
				}

				return <div>{state}</div>;
			}

			const html = await render(<App />);
			expect(html).to.equal("<div>5</div>");
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

			const html = await render(<App />);
			expect(html).to.equal("<div>1<button>Increment</button></div>");
		});

		it("should properly update signal values changed during mount", async () => {
			function App() {
				const count = useSignal(0);
				if (count.value == 0) {
					count.value++;
				}

				return (
					<div>
						{count}
						<button onClick={() => count.value++}>Increment</button>
					</div>
				);
			}

			const html = await render(<App />);
			expect(html).to.equal("<div>1<button>Increment</button></div>");

			const html2 = await render(<App />);
			expect(html2).to.equal("<div>1<button>Increment</button></div>");
		});
	});

	describe("useComputed()", () => {
		it("should render computed signals", async () => {
			function App() {
				const name = useSignal("Bob");
				const greeting = useComputed(() => `Hello ${name}!`);

				return (
					<div>
						<p>{name}</p>
						<h1>{greeting}</h1>
					</div>
				);
			}

			expect(await render(<App />)).to.equal(
				`<div><p>Bob</p><h1>Hello Bob!</h1></div>`
			);
		});

		it("should render updated values for mutated computed signals", async () => {
			function App() {
				const name = useSignal("Bob");
				const greeting = useComputed(() => `Hello ${name}!`);

				name.value = "Alice";

				return (
					<div>
						<p>{name}</p>
						<h1>{greeting}</h1>
					</div>
				);
			}

			expect(await render(<App />)).to.equal(
				`<div><p>Alice</p><h1>Hello Alice!</h1></div>`
			);
		});
	});
}
