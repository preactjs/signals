import { useSignal } from "@preact/signals";
import { signal, Signal } from "@preact/signals-core";
import { createElement, render } from "preact";
import { act, setupRerender } from "preact/test-utils";
import { setupScratch, teardown } from "./test-utils";

describe("Preact", () => {
	let scratch: HTMLDivElement;
	let rerender: () => void;

	beforeEach(() => {
		scratch = setupScratch();
		rerender = setupRerender();
	});

	afterEach(() => {
		teardown(scratch);
	});

	describe("VDOM", () => {
		it("should render signal as text", () => {
			let foo = signal("foo");
			function App() {
				return <h1>{foo}</h1>;
			}
			render(<App />, scratch);
			expect(scratch.textContent).to.equal("foo");
		});

		it.only("should trigger re-render on signal update", () => {
			let foo = signal("foo");
			function App() {
				return <h1>{foo}</h1>;
			}
			render(<App />, scratch);
			expect(scratch.textContent).to.equal("foo");

			act(() => {
				foo.value = "bar";
				expect(scratch.textContent).to.equal("bar");
			});
		});
	});

	describe("useSignal()", () => {
		it("should return signal", () => {
			let signal: Signal;
			function App() {
				signal = useSignal("foo");
				return <h1>{signal}</h1>;
			}
			render(<App />, scratch);
			expect(signal!).to.be.instanceOf(Signal);
		});
	});
});
