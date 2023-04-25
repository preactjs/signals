import * as preactSignals from "@preact/signals";
import { expect } from "chai";
import * as preact from "preact";
import * as preactHooks from "preact/hooks";
import { renderToString } from "preact-render-to-string";
import { mountSignalsTests } from "../../../../test/shared/mounting";

const { createElement } = preact;
const { signal, useSignal, useComputed } = preactSignals;
const sleep = (ms?: number) => new Promise(r => setTimeout(r, ms));

describe("@preact/signals renderToString", () => {
	mountSignalsTests(
		{ ...preact, ...preactHooks },
		preactSignals,
		renderToString
	);

	it("should encode HTML entities", () => {
		const s = signal('hello < & " <p>world!</p>');
		expect(renderToString(<p>{s}</p>)).to.equal(
			`<p>hello &lt; &amp; &quot; &lt;p>world!&lt;/p></p>`
		);
	});

	describe("Property bindings", () => {
		it("should render Signal prop values", () => {
			const a = signal(0);
			// @ts-ignore-next-line
			expect(renderToString(<div count={a} />)).to.equal(
				`<div count="0"></div>`
			);

			const b = signal("hello");
			// @ts-ignore-next-line
			expect(renderToString(<div id={b} />)).to.equal(`<div id="hello"></div>`);
		});

		it("should not subscribe properties to signals", async () => {
			const a = signal(0);
			const b = signal("hi");
			// @ts-ignore-next-line
			expect(renderToString(<p id={b}>{a}</p>)).to.equal(`<p id="hi">0</p>`);
			expect(() => {
				a.value = 1;
			}).not.to.throw();
			expect(() => {
				b.value = "bye";
			}).not.to.throw();
			await sleep(10);
		});

		it("should not subscribe Components to Signals", () => {
			let s = signal(0);
			function App() {
				return <p>{s.value}</p>;
			}
			expect(renderToString(<App />)).to.equal(`<p>0</p>`);
			expect(() => {
				s.value++;
			}).not.to.throw();
		});

		it("should allow re-rendering signals multiple times", () => {
			const a = signal(0);
			const b = signal("hi");

			// @ts-ignore-next-line
			expect(renderToString(<p id={b}>{a}</p>)).to.equal(`<p id="hi">0</p>`);

			a.value++;
			b.value = "bye";

			// @ts-ignore-next-line
			expect(renderToString(<p id={b}>{a}</p>)).to.equal(`<p id="bye">1</p>`);
		});

		it("should render computed signals in properties", async () => {
			function App() {
				const name = useSignal("Bob");
				const greeting = useComputed(() => `Hello ${name}!`);

				return (
					<div>
						{/* @ts-ignore-next-line */}
						<input value={name} />
						<h1 data-text={greeting}>{greeting}</h1>
					</div>
				);
			}

			expect(renderToString(<App />)).to.equal(
				`<div><input value="Bob"/><h1 data-text="Hello Bob!">Hello Bob!</h1></div>`
			);
		});

		it("should render updated values in properties for mutated computed signals", async () => {
			function App() {
				const name = useSignal("Bob");
				const greeting = useComputed(() => `Hello ${name}!`);

				name.value = "Alice";

				return (
					<div>
						{/* @ts-ignore-next-line */}
						<input value={name} />
						<h1 data-text={greeting}>{greeting}</h1>
					</div>
				);
			}

			expect(renderToString(<App />)).to.equal(
				`<div><input value="Alice"/><h1 data-text="Hello Alice!">Hello Alice!</h1></div>`
			);
		});
	});

	it("should allow signal mutation during mounting", async () => {
		// Note: In React - useSyncExternalStore does not allow modifying a signal
		// unguarded. It requires some condition to only modify the signal during
		// the render phase.
		function App() {
			const b = useSignal(0);
			return (
				<div>
					{b.value}
					{++b.value}
					{++b.value}
				</div>
			);
		}
		expect(renderToString(<App />)).to.equal(`<div>012</div>`);
	});
});
