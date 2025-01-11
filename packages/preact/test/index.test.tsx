import {
	computed,
	useComputed,
	useSignalEffect,
	Signal,
	signal,
	useSignal,
} from "@preact/signals";
import type { ReadonlySignal } from "@preact/signals";
import { createElement, createRef, render, createContext } from "preact";
import type { ComponentChildren, FunctionComponent, VNode } from "preact";
import { useContext, useEffect, useRef, useState } from "preact/hooks";
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

	describe("SignalValue bindings", () => {
		it("should render text without signals", () => {
			render(<span>test</span>, scratch);
			const span = scratch.firstChild;
			const text = span?.firstChild;
			expect(text).to.have.property("data", "test");
		});

		it("should render Signals as SignalValue", () => {
			const sig = signal("test");
			render(<span>{sig}</span>, scratch);
			const span = scratch.firstChild;
			expect(span).to.have.property("firstChild").that.is.an.instanceOf(Text);
			const text = span?.firstChild;
			expect(text).to.have.property("data", "test");
		});

		it("should update Signal-based SignalValue (no parent component)", async () => {
			const sig = signal("test");
			render(<span>{sig}</span>, scratch);

			const text = scratch.firstChild!.firstChild!;
			expect(text).to.have.property("data", "test");

			act(() => {
				sig.value = "changed";
			});

			// should not remount/replace SignalValue
			expect(scratch.firstChild!.firstChild!).to.equal(text);
			// should update the text in-place
			expect(text).to.have.property("data", "changed");
		});

		it("should update Signal-based SignalValue (in a parent component)", async () => {
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

			act(() => {
				sig.value = "changed";
			});

			// should not remount/replace SignalValue
			expect(scratch.firstChild!.firstChild!).to.equal(text);
			// should update the text in-place
			expect(text).to.have.property("data", "changed");

			await sleep();
			expect(spy).not.to.have.been.called;
		});

		it("should support swapping Signals in SignalValue positions", async () => {
			const sig = signal("test");
			const spy = sinon.spy();
			function App({ x }: { x: typeof sig }) {
				spy();
				return <span>{x}</span>;
			}

			act(() => {
				render(<App x={sig} />, scratch);
			});
			spy.resetHistory();

			const text = scratch.firstChild!.firstChild!;
			expect(text).to.have.property("data", "test");

			const sig2 = signal("different");
			act(() => {
				render(<App x={sig2} />, scratch);
			});
			expect(spy).to.have.been.called;
			spy.resetHistory();

			// should not remount/replace SignalValue
			expect(scratch.firstChild!.firstChild!).to.equal(text);
			// should update the text in-place
			expect(text).to.have.property("data", "different");

			await sleep();
			expect(spy).not.to.have.been.called;

			act(() => {
				sig.value = "changed old signal";
			});

			await sleep();
			expect(spy).not.to.have.been.called;
			// the text should _not_ have changed:
			expect(text).to.have.property("data", "different");

			act(() => {
				sig2.value = "changed";
			});

			expect(scratch.firstChild!.firstChild!).to.equal(text);
			expect(text).to.have.property("data", "changed");

			await sleep();
			expect(spy).not.to.have.been.called;
		});

		it("should support rendering JSX in SignalValue positions", async () => {
			const sig = signal(<span>test</span>);
			function App({ x }: { x: typeof sig }) {
				return <span>{x}</span>;
			}

			render(<App x={sig} />, scratch);

			const text = scratch.firstChild!.firstChild!;

			expect(text.textContent).to.equal("test");
			expect(text).to.be.an.instanceOf(HTMLSpanElement);
			expect(text).to.have.property("firstChild").that.is.an.instanceOf(Text);
		});

		it("JSX in SignalValue should be reactive", async () => {
			const sig = signal(<span>test</span>);
			const spy = sinon.spy();
			function App({ x }: { x: typeof sig }) {
				spy();
				return <span>{x}</span>;
			}

			render(<App x={sig} />, scratch);
			expect(spy).to.have.been.calledOnce;
			spy.resetHistory();

			const text = scratch.firstChild!.firstChild!;

			expect(text.textContent).to.equal("test");
			expect(text).to.be.an.instanceOf(HTMLSpanElement);
			expect(text).to.have.property("firstChild").that.is.an.instanceOf(Text);

			act(() => {
				sig.value = <div>a</div>;
			});
			expect(spy).not.to.have.been.calledOnce;
			scratch.firstChild!.firstChild!.textContent!.should.equal("a");
		});

		it("should support swapping between JSX and string in SignalValue positions", async () => {
			const sig = signal<JSX.Element | string>(<span>test</span>);
			function App({ x }: { x: typeof sig }) {
				return <span>{x}</span>;
			}

			render(<App x={sig} />, scratch);

			let text = scratch.firstChild!.firstChild!;

			expect(text.textContent).to.equal("test");
			expect(text).to.be.an.instanceOf(HTMLSpanElement);
			expect(text).to.have.property("firstChild").that.is.an.instanceOf(Text);

			act(() => {
				sig.value = "a";
			});
			text = scratch.firstChild!.firstChild!;
			expect(text.nodeType).to.equal(Node.TEXT_NODE);
			expect(text.textContent).to.equal("a");

			act(() => {
				sig.value = "b";
			});
			expect(text.textContent).to.equal("b");

			act(() => {
				sig.value = <div>c</div>;
			});
			await sleep();
			text = scratch.firstChild!.firstChild!;

			expect(text).to.be.an.instanceOf(HTMLDivElement);
			expect(text.textContent).to.equal("c");
			act(() => {
				sig.value = <span>d</span>;
			});
			rerender();
			await sleep();

			text = scratch.firstChild!.firstChild!;
			expect(text).to.be.an.instanceOf(HTMLSpanElement);
			expect(text.textContent).to.equal("d");
		});

		describe("garbage collection", function () {
			// Skip GC tests if window.gc/global.gc is not defined.
			before(function () {
				if (typeof gc === "undefined") {
					this.skip();
				}
			});

			it("should not hold on to references to signals and computeds after unmount", async () => {
				const sig = signal("test");

				let update: (content: VNode) => void;
				function App() {
					const [content, setContent] = useState(<div>{sig}</div>);
					update = setContent;
					return content;
				}

				render(<App />, scratch);
				expect(scratch.firstChild!.firstChild!).to.have.property(
					"data",
					"test"
				);

				let ref: WeakRef<ReadonlySignal>;
				(function () {
					// Create a new computed inside a new IIFE scope, so that
					// we can explicitly hold a _only_ weak reference to it.
					const c = computed(() => sig.value + " computed");
					ref = new WeakRef(c);

					// Mount the new computed to App. Wrap it inside <span> so that `c`
					// will get unmounted when we replace the spans with divs later.
					act(() => update(<span>{c}</span>));
				})();

				expect(scratch.firstChild!.firstChild!).to.have.property(
					"data",
					"test computed"
				);

				act(() => update(<div>{sig}</div>));
				expect(scratch.firstChild!.firstChild!).to.have.property(
					"data",
					"test"
				);

				// Ensure that the computed has a chance to get GC'd.
				(gc as () => void)();
				await sleep(0);
				(gc as () => void)();
				expect(ref.deref()).to.be.undefined;
			});
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

		it('should not update signals that are "equal"', () => {
			const count = signal(0);
			const time = computed(() => (count.value < 2 ? count.value : "max"));
			let renders = 0;
			const Time = () => {
				const value = time.value;
				renders++;
				return <p>{value}</p>;
			};
			render(<Time />, scratch);
			expect(scratch.textContent).to.equal("0");
			expect(renders).to.equal(1);

			act(() => {
				count.value++;
			});
			expect(scratch.textContent).to.equal("1");
			expect(renders).to.equal(2);

			act(() => {
				count.value++;
			});
			expect(scratch.textContent).to.equal("max");
			expect(renders).to.equal(3);

			act(() => {
				count.value++;
			});
			expect(scratch.textContent).to.equal("max");
			expect(renders).to.equal(3);
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

		it("should minimize rerenders when passing signals through context", () => {
			function spyOn<P = { children?: ComponentChildren }>(
				c: FunctionComponent<P>
			) {
				return sinon.spy(c);
			}

			// Manually read signal value below so we can watch whether components rerender
			const Origin = spyOn(function Origin() {
				const origin = useContext(URLModelContext).origin;
				return <span>{origin.value}</span>;
			});

			const Pathname = spyOn(function Pathname() {
				const pathname = useContext(URLModelContext).pathname;
				return <span>{pathname.value}</span>;
			});

			const Search = spyOn(function Search() {
				const search = useContext(URLModelContext).search;
				return <span>{search.value}</span>;
			});

			// Never reads signal value during render so should never rerender
			const UpdateURL = spyOn(function UpdateURL() {
				const update = useContext(URLModelContext).update;
				return (
					<button
						onClick={() => {
							update(newURL => {
								newURL.search = newURL.search === "?a=1" ? "?a=2" : "?a=1";
							});
						}}
					>
						update
					</button>
				);
			});

			interface URLModel {
				origin: ReadonlySignal<string>;
				pathname: ReadonlySignal<string>;
				search: ReadonlySignal<string>;
				update(updater: (newURL: URL) => void): void;
			}

			// Also never reads signal value during render so should never rerender
			const URLModelContext = createContext<URLModel>(null as any);
			const URLModelProvider = spyOn(function SignalProvider({ children }) {
				const url = useSignal(new URL("https://domain.com/test?a=1"));
				const modelRef = useRef<URLModel | null>(null);

				if (modelRef.current == null) {
					modelRef.current = {
						origin: computed(() => url.value.origin),
						pathname: computed(() => url.value.pathname),
						search: computed(() => url.value.search),
						update(updater) {
							const newURL = new URL(url.value);
							updater(newURL);
							url.value = newURL;
						},
					};
				}

				return (
					<URLModelContext.Provider value={modelRef.current}>
						{children}
					</URLModelContext.Provider>
				);
			});

			function App() {
				return (
					<URLModelProvider>
						<p>
							<Origin />
							<Pathname />
							<Search />
						</p>
						<UpdateURL />
					</URLModelProvider>
				);
			}

			render(<App />, scratch);

			const url = scratch.querySelector("p")!;
			expect(url.textContent).to.equal("https://domain.com/test?a=1");
			expect(URLModelProvider).to.be.calledOnce;
			expect(Origin).to.be.calledOnce;
			expect(Pathname).to.be.calledOnce;
			expect(Search).to.be.calledOnce;

			scratch.querySelector("button")!.click();
			rerender();

			expect(url.textContent).to.equal("https://domain.com/test?a=2");
			expect(URLModelProvider).to.be.calledOnce;
			expect(Origin).to.be.calledOnce;
			expect(Pathname).to.be.calledOnce;
			expect(Search).to.be.calledTwice;
		});

		it("should not subscribe to computed signals only created and not used", () => {
			const sig = signal(0);
			const childSpy = sinon.spy();
			const parentSpy = sinon.spy();

			function Child({ num }: { num: ReadonlySignal<number> }) {
				childSpy();
				return <p>{num.value}</p>;
			}

			function Parent({ num }: { num: Signal<number> }) {
				parentSpy();
				const sig2 = useComputed(() => num.value + 1);
				return <Child num={sig2} />;
			}

			render(<Parent num={sig} />, scratch);
			expect(scratch.innerHTML).to.equal("<p>1</p>");
			expect(parentSpy).to.be.calledOnce;
			expect(childSpy).to.be.calledOnce;

			sig.value += 1;
			rerender();
			expect(scratch.innerHTML).to.equal("<p>2</p>");
			expect(parentSpy).to.be.calledOnce;
			expect(childSpy).to.be.calledTwice;
		});

		it("should properly subscribe and unsubscribe to conditionally rendered computed signals ", () => {
			const computedDep = signal(0);
			const renderComputed = signal(true);
			const renderSpy = sinon.spy();
			const computer = sinon.spy(() => computedDep.value + 1);

			function App() {
				renderSpy();
				const computed = useComputed(computer);
				return renderComputed.value ? <p>{computed.value}</p> : null;
			}

			render(<App />, scratch);
			expect(scratch.innerHTML).to.equal("<p>1</p>");
			expect(renderSpy).to.be.calledOnce;
			expect(computer).to.be.calledOnce;

			computedDep.value += 1;
			rerender();
			expect(scratch.innerHTML).to.equal("<p>2</p>");
			expect(renderSpy).to.be.calledTwice;
			expect(computer).to.be.calledTwice;

			renderComputed.value = false;
			rerender();
			expect(scratch.innerHTML).to.equal("");
			expect(renderSpy).to.be.calledThrice;
			expect(computer).to.be.calledTwice;

			computedDep.value += 1;
			rerender();
			expect(scratch.innerHTML).to.equal("");
			expect(renderSpy).to.be.calledThrice; // Should not be called again
			expect(computer).to.be.calledTwice; // Should not be called again
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

		it("should update the checked property on change", async () => {
			const s = signal(true);
			// @ts-ignore
			render(<input checked={s} />, scratch);

			expect(scratch.firstChild).to.have.property("checked", true);

			act(() => {
				s.value = false;
			});

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

			act(() => {
				s.value = "updated";
			});

			expect(scratch.firstChild).to.have.property("value", "updated");

			// ensure the component was never re-rendered: (even after a tick)
			await sleep();
			expect(spy).not.to.have.been.called;

			act(() => {
				s.value = "second update";
			});

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

			act(() => {
				style.value = "left: 20px;";
			});

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

	describe("hooks mixed with signals", () => {
		it("signals should not stop context from propagating", () => {
			const ctx = createContext({ test: "should-not-exist" });
			let update: any;

			function Provider(props: any) {
				const [test, setTest] = useState("foo");
				update = setTest;
				return <ctx.Provider value={{ test }}>{props.children}</ctx.Provider>;
			}

			const s = signal("baz");
			function Test() {
				const value = useContext(ctx);
				return (
					<p>
						{value.test} {s.value}
					</p>
				);
			}

			function App() {
				return (
					<Provider>
						<Test />
					</Provider>
				);
			}

			render(<App />, scratch);

			expect(scratch.innerHTML).to.equal("<p>foo baz</p>");
			act(() => {
				update("bar");
			});
			expect(scratch.innerHTML).to.equal("<p>bar baz</p>");
		});
	});

	describe("useSignalEffect()", () => {
		it("should be invoked after commit", async () => {
			const ref = createRef();
			const sig = signal("foo");
			const spy = sinon.spy();
			let count = 0;

			function App() {
				useSignalEffect(() => {
					spy(
						sig.value,
						ref.current,
						ref.current.getAttribute("data-render-id")
					);
				});
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
			expect(spy).to.have.been.calledOnceWith(
				"foo",
				scratch.firstElementChild,
				"0"
			);

			spy.resetHistory();

			act(() => {
				sig.value = "bar";
			});

			expect(scratch.textContent).to.equal("bar");

			expect(spy).to.have.been.calledOnceWith(
				"bar",
				scratch.firstElementChild,
				"1"
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
					return () => {
						cleanup(value, ref.current, id);
					};
				});
				return (
					<p ref={ref} data-render-id={count++}>
						{sig.value}
					</p>
				);
			}

			act(() => {
				render(<App />, scratch);
			});

			expect(cleanup).not.to.have.been.called;
			expect(spy).to.have.been.calledOnceWith(
				"foo",
				scratch.firstElementChild,
				"0"
			);
			spy.resetHistory();

			act(() => {
				sig.value = "bar";
			});

			expect(scratch.textContent).to.equal("bar");

			const child = scratch.firstElementChild;
			expect(cleanup).to.have.been.calledOnceWith("foo", child, "0");
			expect(spy).to.have.been.calledOnceWith("bar", child, "1");
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

			const child = scratch.firstElementChild;

			expect(cleanup).not.to.have.been.called;
			expect(spy).to.have.been.calledOnceWith("foo", child);
			spy.resetHistory();

			act(() => {
				render(null, scratch);
			});

			expect(spy).not.to.have.been.called;
			expect(cleanup).to.have.been.calledOnceWith("foo", child);
		});
	});

	// TODO: add test when we upgrade lockfile and Preact to latest
	it.skip("Should take hooks-state settling in account", () => {
		const renderSpy = sinon.spy();
		const Context = createContext({
			addModal: () => {},
			removeModal: () => {},
		});

		function ModalProvider(props: any) {
			let [modalCount, setModalCount] = useState(0);
			renderSpy(modalCount);
			let context = {
				modalCount,
				addModal() {
					setModalCount(count => count + 1);
				},
				removeModal() {
					setModalCount(count => count - 1);
				},
			};

			return (
				<Context.Provider value={context}>{props.children}</Context.Provider>
			);
		}

		function useModal() {
			let context = useContext(Context);
			useEffect(() => {
				context.addModal();
				return () => {
					context.removeModal();
				};
			}, [context]);
		}

		function Popover() {
			useModal();
			return <div>Popover</div>;
		}

		function App() {
			return (
				<ModalProvider>
					<Popover />
				</ModalProvider>
			);
		}

		act(() => {
			render(<App />, scratch);
		});

		expect(renderSpy).to.be.calledTwice;
	});
});
