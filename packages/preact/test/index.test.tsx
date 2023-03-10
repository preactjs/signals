import {
	signal,
	computed,
	useComputed,
	useSignalEffect,
	Signal,
} from "@preact/signals";
import { createElement, createRef, render } from "preact";
import { setupRerender, act } from "preact/test-utils";

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

	describe("inheritance", () => {
		it("should have signals inherit from Signal", () => {
			expect(signal(0)).to.be.instanceof(Signal);
		});

		it("should have computed inherit from Signal", () => {
			expect(computed(() => 0)).to.be.instanceof(Signal);
		});
	});

	describe("Text bindings", () => {
		it("should render text without signals", () => {
			render(<span>test</span>, scratch);
			const span = scratch.firstChild;
			const text = span?.firstChild;
			expect(text).to.have.property("data", "test");
		});

		it("should render Signals as Text", () => {
			const sig = signal("test");
			render(<span>{sig}</span>, scratch);
			const span = scratch.firstChild;
			expect(span).to.have.property("firstChild").that.is.an.instanceOf(Text);
			const text = span?.firstChild;
			expect(text).to.have.property("data", "test");
		});

		it("should update Signal-based Text (no parent component)", () => {
			const sig = signal("test");
			render(<span>{sig}</span>, scratch);

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
				return <span>{x}</span>;
			}
			render(<App x={sig} />, scratch);
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
				return <span>{x}</span>;
			}
			render(<App x={sig} />, scratch);
			spy.resetHistory();

			const text = scratch.firstChild!.firstChild!;
			expect(text).to.have.property("data", "test");

			const sig2 = signal("different");
			render(<App x={sig2} />, scratch);
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
				return <p>{value}</p>;
			}

			render(<App />, scratch);
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
				return <p>{str}</p>;
			}

			const fn = () => render(<App />, scratch);
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

			render(<App />, scratch);
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
			render(<input checked={s} />, scratch);

			expect(scratch.firstChild).to.have.property("checked", true);
			expect(s.value).to.equal(true);
		});

		it("should update the checked property on change", () => {
			const s = signal(true);
			// @ts-ignore
			render(<input checked={s} />, scratch);

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
				return <input value={s} />;
			}
			render(<Wrap />, scratch);
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
				return <div style={style} />;
			}
			render(<Wrap />, scratch);
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

		it("should set updated signal prop values at most once", async () => {
			const s = signal("initial");
			const spy = sinon.spy();
			function Wrap() {
				spy();
				// @ts-ignore
				return <span ariaLabel={s} ariaDescription={s.value} />;
			}
			render(<Wrap />, scratch);
			spy.resetHistory();

			const span = scratch.firstElementChild as HTMLSpanElement;
			const ariaLabel = sinon.spy();
			Object.defineProperty(span, "ariaLabel", {
				set: ariaLabel,
			});
			const ariaDescription = sinon.spy();
			Object.defineProperty(span, "ariaDescription", {
				set: ariaDescription,
			});

			act(() => {
				s.value = "updated";
			});

			expect(spy).to.have.been.calledOnce;

			expect(ariaLabel).to.have.been.calledOnce;
			expect(ariaLabel).to.have.been.calledWith("updated");
			ariaLabel.resetHistory();

			expect(ariaDescription).to.have.been.calledOnce;
			expect(ariaDescription).to.have.been.calledWith("updated");
			ariaDescription.resetHistory();

			// ensure the component was never re-rendered: (even after a tick)
			await sleep();

			expect(ariaLabel).not.to.have.been.called;
			expect(ariaDescription).not.to.have.been.called;

			act(() => {
				s.value = "second update";
			});

			expect(ariaLabel).to.have.been.calledOnce;
			expect(ariaLabel).to.have.been.calledWith("second update");
			ariaLabel.resetHistory();

			expect(ariaDescription).to.have.been.calledOnce;
			expect(ariaDescription).to.have.been.calledWith("second update");
			ariaDescription.resetHistory();

			// ensure the component was never re-rendered: (even after a tick)
			await sleep();

			expect(ariaLabel).not.to.have.been.called;
			expect(ariaDescription).not.to.have.been.called;
		});

		it("should set SVG values", async () => {
			const s = signal("scale(1 1)");

			function App() {
				return (
					<svg>
						<line
							// @ts-ignore
							transform={s}
						/>
					</svg>
				);
			}
			render(<App />, scratch);

			act(() => {
				// This should not crash
				s.value = "scale(1, 2)";
			});
		});
	});

	describe("useSignalEffect()", () => {
		it("should be invoked after commit", async () => {
			const ref = createRef();
			const sig = signal("foo");
			const spy = sinon.spy();
			let count = 0;

			function App() {
				useSignalEffect(() =>
					spy(
						sig.value,
						ref.current,
						ref.current.getAttribute("data-render-id")
					)
				);
				return (
					<p ref={ref} data-render-id={count++}>
						{sig.value}
					</p>
				);
			}

			act(() => {
				render(<App />, scratch);
			});
			expect(scratch.textContent).to.equal("foo");
			// expect(spy).not.to.have.been.called;
			await sleep(1);
			expect(spy).to.have.been.calledOnceWith(
				"foo",
				scratch.firstElementChild,
				"0"
			);

			spy.resetHistory();

			act(() => {
				sig.value = "bar";
				rerender();
			});

			expect(scratch.textContent).to.equal("bar");
			await sleep(1);

			// NOTE: Ideally, call should receive "1" as its third argument!
			// The "0" indicates that Preact's DOM mutations hadn't yet been performed when the callback ran.
			// This happens because we do signal-based effect runs after the first, not VDOM.
			// Perhaps we could find a way to defer the callback when it coincides with a render?
			expect(spy).to.have.been.calledOnceWith(
				"bar",
				scratch.firstElementChild,
				"0" // ideally "1" - update if we find a nice way to do so!
			);
		});

		it("should invoke any returned cleanup function for updates", async () => {
			const ref = createRef();
			const sig = signal("foo");
			const spy = sinon.spy();
			const cleanup = sinon.spy();
			let count = 0;

			function App() {
				useSignalEffect(() => {
					const id = ref.current.getAttribute("data-render-id");
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

			render(<App />, scratch);

			await sleep(1);
			expect(cleanup).not.to.have.been.called;
			expect(spy).to.have.been.calledOnceWith(
				"foo",
				scratch.firstElementChild,
				"0"
			);
			spy.resetHistory();

			act(() => {
				sig.value = "bar";
				rerender();
			});

			expect(scratch.textContent).to.equal("bar");
			await sleep(1);

			const child = scratch.firstElementChild;

			expect(cleanup).to.have.been.calledOnceWith("foo", child, "0");

			expect(spy).to.have.been.calledOnceWith(
				"bar",
				child,
				"0" // ideally "1" - update if we find a nice way to do so!
			);
		});

		it("should invoke any returned cleanup function for unmounts", async () => {
			const ref = createRef();
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

			act(() => {
				render(<App />, scratch);
			});

			await sleep(1);

			const child = scratch.firstElementChild;

			expect(cleanup).not.to.have.been.called;
			expect(spy).to.have.been.calledOnceWith("foo", child);
			spy.resetHistory();

			act(() => {
				render(null, scratch);
			});

			await sleep(1);

			expect(spy).not.to.have.been.called;
			expect(cleanup).to.have.been.calledOnceWith("foo", child);
		});
	});
});
