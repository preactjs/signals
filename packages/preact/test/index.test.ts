import { signal } from "@preact/signals";
import { h, render } from "preact";

describe("@preact/signals", () => {
	let scratch: HTMLDivElement;

	beforeEach(() => {
		scratch = document.createElement("div");
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
});
