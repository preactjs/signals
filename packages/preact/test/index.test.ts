import { signal, useComputed } from "@preact/signals";
import { h, render } from "preact";
import { useMemo } from "preact/hooks";
import { setupRerender } from "preact/test-utils";

const sleep = (ms?: number) => new Promise(r => setTimeout(r, ms));

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

		it("should update Signal-based Text (in a parent component)", async () => {
			const sig = signal("test");
			const spy = sinon.spy();
			function App({ x }: { x: typeof sig }) {
				spy();
				return h("span", null, x);
			}
			render(h(App, { x: sig }), scratch);
			spy.resetHistory();

			const text = scratch.firstChild!.firstChild!;
			expect(text).to.have.property("data", "test");

			sig.value = "changed";

			// should not remount/replace Text
			expect(scratch.firstChild!.firstChild!).to.equal(text);
			// should update the text in-place
			expect(text).to.have.property("data", "changed");

			await sleep();
			expect(spy).not.to.have.been.called;
		});

		it("should support swapping Signals in Text positions", async () => {
			const sig = signal("test");
			const spy = sinon.spy();
			function App({ x }: { x: typeof sig }) {
				spy();
				return h("span", null, x);
			}
			render(h(App, { x: sig }), scratch);
			spy.resetHistory();

			const text = scratch.firstChild!.firstChild!;
			expect(text).to.have.property("data", "test");

			const sig2 = signal("different");
			render(h(App, { x: sig2 }), scratch);
			expect(spy).to.have.been.called;
			spy.resetHistory();

			// should not remount/replace Text
			expect(scratch.firstChild!.firstChild!).to.equal(text);
			// should update the text in-place
			expect(text).to.have.property("data", "different");

			await sleep();
			expect(spy).not.to.have.been.called;

			sig.value = "changed old signal";

			await sleep();
			expect(spy).not.to.have.been.called;
			// the text should _not_ have changed:
			expect(text).to.have.property("data", "different");

			sig2.value = "changed";

			expect(scratch.firstChild!.firstChild!).to.equal(text);
			expect(text).to.have.property("data", "changed");

			await sleep();
			expect(spy).not.to.have.been.called;
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
	});

	describe("prop bindings", () => {
		it("should set the initial value of the checked property", () => {
			const s = signal(true);
			// @ts-ignore
			render(h("input", { checked: s }), scratch);

			expect(scratch.firstChild).to.have.property("checked", true);
			expect(s.value).to.equal(true);
		});

		it("should update the checked property on change", () => {
			const s = signal(true);
			// @ts-ignore
			render(h("input", { checked: s }), scratch);

			expect(scratch.firstChild).to.have.property("checked", true);

			s.value = false;

			expect(scratch.firstChild).to.have.property("checked", false);
		});

		it("should update props without re-rendering", async () => {
			const s = signal("initial");
			const spy = sinon.spy();
			function Wrap() {
				spy();
				// @ts-ignore
				return h("input", { value: s });
			}
			render(h(Wrap, {}), scratch);
			spy.resetHistory();

			expect(scratch.firstChild).to.have.property("value", "initial");

			s.value = "updated";

			expect(scratch.firstChild).to.have.property("value", "updated");

			// ensure the component was never re-rendered: (even after a tick)
			await sleep();
			expect(spy).not.to.have.been.called;

			s.value = "second update";

			expect(scratch.firstChild).to.have.property("value", "second update");

			// ensure the component was never re-rendered: (even after a tick)
			await sleep();
			expect(spy).not.to.have.been.called;
		});

		it("should set and update string style property", async () => {
			const style = signal("left: 10px");
			const spy = sinon.spy();
			function Wrap() {
				spy();
				// @ts-ignore
				return h("div", { style });
			}
			render(h(Wrap, {}), scratch);
			spy.resetHistory();

			const div = scratch.firstChild as HTMLDivElement;

			expect(div.style).to.have.property("left", "10px");

			// ensure the component was never re-rendered: (even after a tick)
			await sleep();
			expect(spy).not.to.have.been.called;

			style.value = "left: 20px;";

			expect(div.style).to.have.property("left", "20px");

			// ensure the component was never re-rendered: (even after a tick)
			await sleep();
			expect(spy).not.to.have.been.called;
		});
	});
});
