import { createElement, Fragment } from "react";
import { Signal, signal, batch } from "@preact/signals-core";
import { useSignals } from "@preact/signals-react/runtime";
import {
	Root,
	createRoot,
	act,
	checkHangingAct,
	getConsoleErrorSpy,
	checkConsoleErrorLogs,
} from "../../test/shared/utils";

describe("useSignals", () => {
	let scratch: HTMLDivElement;
	let root: Root;

	async function render(element: Parameters<Root["render"]>[0]) {
		await act(() => root.render(element));
	}

	beforeEach(async () => {
		scratch = document.createElement("div");
		document.body.appendChild(scratch);
		root = await createRoot(scratch);
		getConsoleErrorSpy().resetHistory();
	});

	afterEach(async () => {
		await act(() => root.unmount());
		scratch.remove();

		checkConsoleErrorLogs();
		checkHangingAct();
	});

	it("should rerender components when signals they use change", async () => {
		const signal1 = signal(0);
		function Child1() {
			useSignals();
			return <p>{signal1.value}</p>;
		}

		const signal2 = signal(0);
		function Child2() {
			useSignals();
			return <p>{signal2.value}</p>;
		}

		function Parent() {
			return (
				<Fragment>
					<Child1 />
					<Child2 />
				</Fragment>
			);
		}

		await render(<Parent />);
		expect(scratch.innerHTML).to.equal("<p>0</p><p>0</p>");

		await act(() => {
			signal1.value += 1;
		});
		expect(scratch.innerHTML).to.equal("<p>1</p><p>0</p>");

		await act(() => {
			signal2.value += 1;
		});
		expect(scratch.innerHTML).to.equal("<p>1</p><p>1</p>");
	});

	it("should correctly invoke rerenders if useSignals is called multiple times in the same component", async () => {
		const signal1 = signal(0);
		const signal2 = signal(0);
		const signal3 = signal(0);
		function App() {
			useSignals();
			const sig1 = signal1.value;
			useSignals();
			const sig2 = signal2.value;
			const sig3 = signal3.value;
			useSignals();
			return (
				<p>
					{sig1}
					{sig2}
					{sig3}
				</p>
			);
		}

		await render(<App />);
		expect(scratch.innerHTML).to.equal("<p>000</p>");

		await act(() => {
			signal1.value += 1;
		});
		expect(scratch.innerHTML).to.equal("<p>100</p>");

		await act(() => {
			signal2.value += 1;
		});
		expect(scratch.innerHTML).to.equal("<p>110</p>");

		await act(() => {
			signal3.value += 1;
		});
		expect(scratch.innerHTML).to.equal("<p>111</p>");
	});

	it("should not rerender components when signals they use do not change", async () => {
		const child1Spy = sinon.spy();
		const signal1 = signal(0);
		function Child1() {
			child1Spy();
			useSignals();
			return <p>{signal1.value}</p>;
		}

		const child2Spy = sinon.spy();
		const signal2 = signal(0);
		function Child2() {
			child2Spy();
			useSignals();
			return <p>{signal2.value}</p>;
		}

		const parentSpy = sinon.spy();
		function Parent() {
			parentSpy();
			return (
				<Fragment>
					<Child1 />
					<Child2 />
				</Fragment>
			);
		}

		function resetSpies() {
			child1Spy.resetHistory();
			child2Spy.resetHistory();
			parentSpy.resetHistory();
		}

		resetSpies();
		await render(<Parent />);
		expect(scratch.innerHTML).to.equal("<p>0</p><p>0</p>");
		expect(child1Spy).to.have.been.calledOnce;
		expect(child2Spy).to.have.been.calledOnce;
		expect(parentSpy).to.have.been.calledOnce;

		resetSpies();
		await act(() => {
			signal1.value += 1;
		});
		expect(scratch.innerHTML).to.equal("<p>1</p><p>0</p>");
		expect(child1Spy).to.have.been.calledOnce;
		expect(child2Spy).to.not.have.been.called;
		expect(parentSpy).to.not.have.been.called;

		resetSpies();
		await act(() => {
			signal2.value += 1;
		});
		expect(scratch.innerHTML).to.equal("<p>1</p><p>1</p>");
		expect(child1Spy).to.not.have.been.called;
		expect(child2Spy).to.have.been.calledOnce;
		expect(parentSpy).to.not.have.been.called;
	});

	it("should not rerender components when signals they use change but they are not mounted", async () => {
		const child1Spy = sinon.spy();
		const signal1 = signal(0);
		function Child() {
			child1Spy();
			useSignals();
			const sig1 = signal1.value;
			return <p>{sig1}</p>;
		}

		function Parent({ show }: { show: boolean }) {
			return <Fragment>{show && <Child />}</Fragment>;
		}

		await render(<Parent show={true} />);
		expect(scratch.innerHTML).to.equal("<p>0</p>");

		await act(() => {
			signal1.value += 1;
		});
		expect(scratch.innerHTML).to.equal("<p>1</p>");

		await act(() => {
			render(<Parent show={false} />);
		});
		expect(scratch.innerHTML).to.equal("");

		await act(() => {
			signal1.value += 1;
		});
		expect(child1Spy).to.have.been.calledTwice;
	});

	it("should not rerender components that only update signals in event handlers", async () => {
		const buttonSpy = sinon.spy();
		function AddOneButton({ num }: { num: Signal<number> }) {
			useSignals();
			buttonSpy();
			return (
				<button
					onClick={() => {
						num.value += 1;
					}}
				>
					Add One
				</button>
			);
		}

		const displaySpy = sinon.spy();
		function DisplayNumber({ num }: { num: Signal<number> }) {
			useSignals();
			displaySpy();
			return <p>{num.value}</p>;
		}

		const number = signal(0);
		function App() {
			return (
				<Fragment>
					<AddOneButton num={number} />
					<DisplayNumber num={number} />
				</Fragment>
			);
		}

		await render(<App />);
		expect(scratch.innerHTML).to.equal("<button>Add One</button><p>0</p>");
		expect(buttonSpy).to.have.been.calledOnce;
		expect(displaySpy).to.have.been.calledOnce;

		await act(() => {
			scratch.querySelector("button")!.click();
		});

		expect(scratch.innerHTML).to.equal("<button>Add One</button><p>1</p>");
		expect(buttonSpy).to.have.been.calledOnce;
		expect(displaySpy).to.have.been.calledTwice;
	});

	it("should not rerender components that only read signals in event handlers", async () => {
		const buttonSpy = sinon.spy();
		function AddOneButton({ num }: { num: Signal<number> }) {
			useSignals();
			buttonSpy();
			return (
				<button
					onClick={() => {
						num.value += adder.value;
					}}
				>
					Add One
				</button>
			);
		}

		const displaySpy = sinon.spy();
		function DisplayNumber({ num }: { num: Signal<number> }) {
			useSignals();
			displaySpy();
			return <p>{num.value}</p>;
		}

		const adder = signal(2);
		const number = signal(0);
		function App() {
			return (
				<Fragment>
					<AddOneButton num={number} />
					<DisplayNumber num={number} />
				</Fragment>
			);
		}

		function resetSpies() {
			buttonSpy.resetHistory();
			displaySpy.resetHistory();
		}

		resetSpies();
		await render(<App />);
		expect(scratch.innerHTML).to.equal("<button>Add One</button><p>0</p>");
		expect(buttonSpy).to.have.been.calledOnce;
		expect(displaySpy).to.have.been.calledOnce;

		resetSpies();
		await act(() => {
			scratch.querySelector("button")!.click();
		});

		expect(scratch.innerHTML).to.equal("<button>Add One</button><p>2</p>");
		expect(buttonSpy).to.not.have.been.called;
		expect(displaySpy).to.have.been.calledOnce;

		resetSpies();
		await act(() => {
			adder.value += 1;
		});

		expect(scratch.innerHTML).to.equal("<button>Add One</button><p>2</p>");
		expect(buttonSpy).to.not.have.been.called;
		expect(displaySpy).to.not.have.been.called;

		resetSpies();
		await act(() => {
			scratch.querySelector("button")!.click();
		});

		expect(scratch.innerHTML).to.equal("<button>Add One</button><p>5</p>");
		expect(buttonSpy).to.not.have.been.called;
		expect(displaySpy).to.have.been.calledOnce;
	});

	it("should properly rerender components that use custom hooks", async () => {
		const greeting = signal("Hello");
		function useGreeting() {
			useSignals();
			return greeting.value;
		}

		const name = signal("John");
		function useName() {
			useSignals();
			return name.value;
		}

		function App() {
			const greeting = useGreeting();
			const name = useName();
			return (
				<div>
					{greeting} {name}!
				</div>
			);
		}

		await render(<App />);
		expect(scratch.innerHTML).to.equal("<div>Hello John!</div>");

		await act(() => {
			greeting.value = "Hi";
		});
		expect(scratch.innerHTML).to.equal("<div>Hi John!</div>");

		await act(() => {
			name.value = "Jane";
		});
		expect(scratch.innerHTML).to.equal("<div>Hi Jane!</div>");

		await act(() => {
			batch(() => {
				greeting.value = "Hello";
				name.value = "John";
			});
		});
		expect(scratch.innerHTML).to.equal("<div>Hello John!</div>");
	});

	it("should properly rerender components that use custom hooks and signals", async () => {
		const greeting = signal("Hello");
		function useGreeting() {
			useSignals();
			return greeting.value;
		}

		const name = signal("John");
		function useName() {
			useSignals();
			return name.value;
		}

		const punctuation = signal("!");
		function App() {
			useSignals();
			const greeting = useGreeting();
			const name = useName();
			return (
				<div>
					{greeting} {name}
					{punctuation.value}
				</div>
			);
		}

		await render(<App />);
		expect(scratch.innerHTML).to.equal("<div>Hello John!</div>");

		await act(() => {
			greeting.value = "Hi";
		});
		expect(scratch.innerHTML).to.equal("<div>Hi John!</div>");

		await act(() => {
			name.value = "Jane";
		});
		expect(scratch.innerHTML).to.equal("<div>Hi Jane!</div>");

		await act(() => {
			punctuation.value = "?";
		});
		expect(scratch.innerHTML).to.equal("<div>Hi Jane?</div>");

		await act(() => {
			batch(() => {
				greeting.value = "Hello";
				name.value = "John";
				punctuation.value = "!";
			});
		});
		expect(scratch.innerHTML).to.equal("<div>Hello John!</div>");
	});
});
