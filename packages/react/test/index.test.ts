// @ts-ignore-next-line
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { signal, useComputed } from "@preact/signals-react";
import { createElement as h, useMemo } from "react";
import { createRoot, Root } from "react-dom/client";
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
			render(h("span", null, "test"));
			const span = scratch.firstChild;
			const text = span?.firstChild;
			expect(text).to.have.property("data", "test");
		});

		it("should render Signals as Text", () => {
			const sig = signal("test");
			render(h("span", null, sig));
			const span = scratch.firstChild;
			expect(span).to.have.property("firstChild").that.is.an.instanceOf(Text);
			const text = span?.firstChild;
			expect(text).to.have.property("data", "test");
		});

		it("should update Signal-based Text (no parent component)", () => {
			const sig = signal("test");
			render(h("span", null, sig));

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
				return h("span", null, x);
			}
			render(h(App, { x: sig }));

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
				return h("p", null, value);
			}

			render(h(App, {}));
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
				return h("p", null, str);
			}

			const fn = () => render(h(App, {}));
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

			render(h(App, {}));
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
				return h("p", null, value);
			}

			function App() {
				sig.value;
				return useMemo(() => h(Inner, { foo: 1 }), []);
			}

			render(h(App, {}));
			expect(scratch.textContent).to.equal("foo");

			act(() => {
				sig.value = "bar";
			});
			expect(scratch.textContent).to.equal("bar");
		});
	});
});
