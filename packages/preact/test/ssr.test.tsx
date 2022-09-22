import { signal, useSignal, useComputed } from "@preact/signals";
import { createElement } from "preact";
import { renderToString } from "preact-render-to-string";

const sleep = (ms?: number) => new Promise(r => setTimeout(r, ms));

describe("@preact/signals", () => {
	describe("SSR", () => {
		it("should render without erroring", () => {
			const s = signal(0);
			function App() {
				return <p>{s}</p>;
			}

			expect(() => renderToString(<App />)).not.to.throw();
		});

		describe("Text bindings", () => {
			it("should render strings", () => {
				const s = signal("hello");
				expect(renderToString(<p>{s}</p>)).to.equal(`<p>hello</p>`);
			});
			it("should encode HTML entities", () => {
				const s = signal('hello < & " world!');
				expect(renderToString(<p>{s}</p>)).to.equal(
					`<p>hello &lt; &amp; &quot; world!</p>`
				);
			});
			it("should render numbers as text", () => {
				const s = signal(0);
				expect(renderToString(<p>{s}</p>)).to.equal(`<p>0</p>`);
			});
			it("should not render booleans", () => {
				const a = signal(true);
				expect(renderToString(<p>{a}</p>)).to.equal(`<p></p>`);

				const b = signal(false);
				expect(renderToString(<p>{b}</p>)).to.equal(`<p></p>`);
			});
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
				expect(renderToString(<div id={b} />)).to.equal(
					`<div id="hello"></div>`
				);
			});
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

		it("should render computed signals", () => {
			function App() {
				const name = useSignal("Bob");
				const greeting = useComputed(() => `Hello ${name}!`);

				return (
					<div>
						{/* @ts-ignore-next-line */}
						<input value={name} />
						<h1>{greeting}</h1>
					</div>
				);
			}

			expect(renderToString(<App />)).to.equal(
				`<div><input value="Bob" /><h1>Hello Bob!</h1></div>`
			);
		});

		it("should render updated values for mutated computed signals", () => {
			function App() {
				const name = useSignal("Bob");
				const greeting = useComputed(() => `Hello ${name}!`);

				name.value = "Alice";

				return (
					<div>
						{/* @ts-ignore-next-line */}
						<input value={name} />
						<h1>{greeting}</h1>
					</div>
				);
			}

			expect(renderToString(<App />)).to.equal(
				`<div><input value="Alice" /><h1>Hello Alice!</h1></div>`
			);
		});

		it("should allow signal mutation during rendering", () => {
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
});
