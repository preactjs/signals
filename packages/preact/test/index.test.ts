import { signal, useComputed } from "@preact/signals";
import { h, render } from "preact";
import { useMemo } from "preact/hooks";
import { setupRerender } from "preact/test-utils";

describe("@preact/signals", () => {
	let scratch: HTMLDivElement;
	let rerender: () => void;

	beforeEach(() => {
		scratch = document.createElement("div");
		rerender = setupRerender();
	});

	afterEach(() => {
		render(null, scratch);
	});

	describe("Text bindings", () => {
		it("should render text without signals", () => {
			render(h("span", null, "test"), scratch);
			const span = scratch.firstChild;
			const text = span?.firstChild;
			expect(text).to.have.property("data", "test");
		});

		it("should render Signals as Text", () => {
			const sig = signal("test");
			render(h("span", null, sig), scratch);
			const span = scratch.firstChild;
			expect(span).to.have.property("firstChild").that.is.an.instanceOf(Text);
			const text = span?.firstChild;
			expect(text).to.have.property("data", "test");
		});

		it("should update Signal-based Text (no parent component)", () => {
			const sig = signal("test");
			render(h("span", null, sig), scratch);

			const text = scratch.firstChild!.firstChild!;
			expect(text).to.have.property("data", "test");

			sig.value = "changed";

			// should not remount/replace Text
			expect(scratch.firstChild!.firstChild!).to.equal(text);
			// should update the text in-place
			expect(text).to.have.property("data", "changed");
		});

		it("should update Signal-based Text (in a parent component)", () => {
			const sig = signal("test");
			function App({ x }: { x: typeof sig }) {
				return h("span", null, x);
			}
			render(h(App, { x: sig }), scratch);

			const text = scratch.firstChild!.firstChild!;
			expect(text).to.have.property("data", "test");

			sig.value = "changed";

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
				return h("p", null, value);
			}

			render(h(App, {}), scratch);
			expect(scratch.textContent).to.equal("foo");

			sig.value = "bar";
			rerender();
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
				return h("p", null, str);
			}

			const fn = () => render(h(App, {}), scratch);
			expect(fn).not.to.throw;
		});

		it("should not subscribe to child signals", () => {
			const sig = signal("foo");

			function Child() {
				const value = sig.value;
				return h("p", null, value);
			}

			const spy = sinon.spy();
			function App() {
				spy();
				return h(Child, null);
			}

			render(h(App, {}), scratch);
			expect(scratch.textContent).to.equal("foo");

			sig.value = "bar";
			rerender();
			expect(spy).to.be.calledOnce;
		});

		it("should update memo'ed component via signals", async () => {
			const sig = signal("foo");

			function Inner() {
				const value = sig.value;
				return h("p", null, value);
			}

			function App() {
				sig.value;
				return useMemo(() => h(Inner, { foo: 1 }), []);
			}

			render(h(App, {}), scratch);
			expect(scratch.textContent).to.equal("foo");

			sig.value = "bar";
			rerender();
			expect(scratch.textContent).to.equal("bar");
		});
	});
});
