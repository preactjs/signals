import * as signalsCore from "@preact/signals-core";
import { batch, signal } from "@preact/signals-core";
import { PluginOptions } from "@preact/signals-react-transform";
import * as signalsRuntime from "@preact/signals-react/runtime";
import * as React from "react";
import { createElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import {
	Root,
	act,
	checkConsoleErrorLogs,
	checkHangingAct,
	createRoot,
	getConsoleErrorSpy,
} from "../../../react/test/shared/utils";

const customSource = "useSignals-custom-source";
const modules: Record<string, any> = {
	"@preact/signals-core": signalsCore,
	"@preact/signals-react/runtime": signalsRuntime,
	react: React,
	"react/jsx-runtime": jsxRuntime,
	[customSource]: signalsRuntime,
};

function testRequire(name: string) {
	if (name in modules) {
		return modules[name];
	} else {
		throw new Error(`Module ${name} not setup in "testRequire".`);
	}
}

async function createComponent(code: string, options?: PluginOptions) {
	// `transformSignalCode` is a global helper function added to the global
	// namespace by a test helper we've included in the Karma config.
	const cjsCode = transformSignalCode(code, options);
	// console.log(cjsCode); // Useful when debugging tests.

	const exports: any = {};
	const wrapper = new Function("exports", "require", cjsCode);
	wrapper(exports, testRequire);
	return exports;
}

describe("React Signals babel transfrom - browser E2E tests", () => {
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

	it("should rerender components when using signals as text", async () => {
		const { App } = await createComponent(`
			export function App({ name }) {
				return <div>Hello {name}</div>;
			}`);

		const name = signal("John");
		await render(<App name={name} />);
		expect(scratch.innerHTML).to.equal("<div>Hello John</div>");

		await act(() => {
			name.value = "Jane";
		});
		expect(scratch.innerHTML).to.equal("<div>Hello Jane</div>");
	});

	it("should rerender components when signals they use change", async () => {
		const { App } = await createComponent(`
			export function App({ name }) {
				return <div>Hello {name.value}</div>;
			}`);

		const name = signal("John");
		await render(<App name={name} />);
		expect(scratch.innerHTML).to.equal("<div>Hello John</div>");

		await act(() => {
			name.value = "Jane";
		});
		expect(scratch.innerHTML).to.equal("<div>Hello Jane</div>");
	});

	it("should rerender components with custom hooks that use signals", async () => {
		const { App, name } = await createComponent(`
			import { signal } from "@preact/signals-core";

			export const name = signal("John");
			function useName() {
				return name.value;
			}

			export function App() {
				const name = useName();
				return <div>Hello {name}</div>;
			}`);

		await render(<App name={name} />);
		expect(scratch.innerHTML).to.equal("<div>Hello John</div>");

		await act(() => {
			name.value = "Jane";
		});
		expect(scratch.innerHTML).to.equal("<div>Hello Jane</div>");
	});

	it("should rerender components with multiple custom hooks that use signals", async () => {
		const { App, name, greeting } = await createComponent(`
			import { signal } from "@preact/signals-core";

			export const greeting = signal("Hello");
			function useGreeting() {
				return greeting.value;
			}

			export const name = signal("John");
			function useName() {
				return name.value;
			}

			export function App() {
				const greeting = useGreeting();
				const name = useName();
				return <div>{greeting} {name}</div>;
			}`);

		await render(<App name={name} />);
		expect(scratch.innerHTML).to.equal("<div>Hello John</div>");

		await act(() => {
			greeting.value = "Hi";
		});
		expect(scratch.innerHTML).to.equal("<div>Hi John</div>");

		await act(() => {
			name.value = "Jane";
		});
		expect(scratch.innerHTML).to.equal("<div>Hi Jane</div>");

		await act(() => {
			batch(() => {
				greeting.value = "Hello";
				name.value = "John";
			});
		});
		expect(scratch.innerHTML).to.equal("<div>Hello John</div>");
	});

	it("should rerender components that use signals with multiple custom hooks that use signals", async () => {
		const { App, name, greeting, punctuation } = await createComponent(`
			import { signal } from "@preact/signals-core";

			export const greeting = signal("Hello");
			function useGreeting() {
				return greeting.value;
			}

			export const name = signal("John");
			function useName() {
				return name.value;
			}

			export const punctuation = signal("!");
			export function App() {
				const greeting = useGreeting();
				const name = useName();
				return <div>{greeting} {name}{punctuation.value}</div>;
			}`);

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

	it("should rerender components wrapped in memo", async () => {
		const { MemoApp, name } = await createComponent(`
			import { signal } from "@preact/signals-core";
			import { memo } from "react";

			export const name = signal("John");

			function App({ name }) {
				return <div>Hello {name.value}</div>;
			}

			export const MemoApp = memo(App);
			`);

		await render(<MemoApp name={name} />);
		expect(scratch.innerHTML).to.equal("<div>Hello John</div>");

		await act(() => {
			name.value = "Jane";
		});
		expect(scratch.innerHTML).to.equal("<div>Hello Jane</div>");
	});

	it("should rerender components wrapped in memo inline", async () => {
		const { MemoApp, name } = await createComponent(`
			import { signal } from "@preact/signals-core";
			import { memo } from "react";

			export const name = signal("John");

			export const MemoApp = memo(({ name }) => {
				return <div>Hello {name.value}</div>;
			});
			`);

		await render(<MemoApp name={name} />);
		expect(scratch.innerHTML).to.equal("<div>Hello John</div>");

		await act(() => {
			name.value = "Jane";
		});
		expect(scratch.innerHTML).to.equal("<div>Hello Jane</div>");
	});

	it("should rerender components wrapped in forwardRef", async () => {
		const { ForwardRefApp, name } = await createComponent(`
			import { signal } from "@preact/signals-core";
			import { forwardRef } from "react";

			export const name = signal("John");

			function App({ name }, ref) {
				return <div ref={ref}>Hello {name.value}</div>;
			}

			export const ForwardRefApp = forwardRef(App);
			`);

		const ref = React.createRef<HTMLDivElement>();
		await render(<ForwardRefApp name={name} ref={ref} />);
		expect(scratch.innerHTML).to.equal("<div>Hello John</div>");
		expect(ref.current).to.equal(scratch.firstChild);

		await act(() => {
			name.value = "Jane";
		});
		expect(scratch.innerHTML).to.equal("<div>Hello Jane</div>");
		expect(ref.current).to.equal(scratch.firstChild);
	});

	it("should rerender components wrapped in forwardRef inline", async () => {
		const { ForwardRefApp, name } = await createComponent(`
			import { signal } from "@preact/signals-core";
			import { forwardRef } from "react";

			export const name = signal("John");

			export const ForwardRefApp = forwardRef(({ name }, ref) => {
				return <div ref={ref}>Hello {name.value}</div>;
			});
			`);

		const ref = React.createRef<HTMLDivElement>();
		await render(<ForwardRefApp name={name} ref={ref} />);
		expect(scratch.innerHTML).to.equal("<div>Hello John</div>");
		expect(ref.current).to.equal(scratch.firstChild);

		await act(() => {
			name.value = "Jane";
		});
		expect(scratch.innerHTML).to.equal("<div>Hello Jane</div>");
		expect(ref.current).to.equal(scratch.firstChild);
	});

	it("should rerender components wrapped in forwardRef with memo", async () => {
		const { MemoForwardRefApp, name } = await createComponent(`
			import { signal } from "@preact/signals-core";
			import { memo, forwardRef } from "react";

			export const name = signal("John");

			export const MemoForwardRefApp = memo(forwardRef(({ name }, ref) => {
				return <div ref={ref}>Hello {name.value}</div>;
			}));
			`);

		const ref = React.createRef<HTMLDivElement>();
		await render(<MemoForwardRefApp name={name} ref={ref} />);
		expect(scratch.innerHTML).to.equal("<div>Hello John</div>");
		expect(ref.current).to.equal(scratch.firstChild);

		await act(() => {
			name.value = "Jane";
		});
		expect(scratch.innerHTML).to.equal("<div>Hello Jane</div>");
		expect(ref.current).to.equal(scratch.firstChild);
	});

	it("should rerender registry-style declared components", async () => {
		const { App, name, lang } = await createComponent(`
			import { signal } from "@preact/signals-core";
			import { memo } from "react";

			const Greeting = {
				English: memo(({ name }) => <div>Hello {name.value}</div>),
				["Espanol"]: memo(({ name }) => <div>Hola {name.value}</div>),
			};

			export const name = signal("John");
			export const lang = signal("English");

			export function App() {
				const Component = Greeting[lang.value];
				return <Component name={name} />;
			}
			`);

		await render(<App />);
		expect(scratch.innerHTML).to.equal("<div>Hello John</div>");

		await act(() => {
			name.value = "Jane";
		});
		expect(scratch.innerHTML).to.equal("<div>Hello Jane</div>");

		await act(() => {
			lang.value = "Espanol";
		});
		expect(scratch.innerHTML).to.equal("<div>Hola Jane</div>");
	});

	it("should transform components authored inside a test's body", async () => {
		const { name, App } = await createComponent(`
			import { signal } from "@preact/signals-core";
			import { memo } from "react";

			export const name = signal("John");
			export let App;

			const it = (name, fn) => fn();

			it('should work', () => {
				App = () => {
					return <div>Hello {name.value}</div>;
				}
			});
			`);

		await render(<App name={name} />);
		expect(scratch.innerHTML).to.equal("<div>Hello John</div>");

		await act(() => {
			name.value = "Jane";
		});

		expect(scratch.innerHTML).to.equal("<div>Hello Jane</div>");
	});

	it("loads useSignals from a custom source", async () => {
		const { App } = await createComponent(
			`
			export function App({ name }) {
				return <div>Hello {name.value}</div>;
			}`,
			{ importSource: customSource }
		);

		const name = signal("John");
		await render(<App name={name} />);
		expect(scratch.innerHTML).to.equal("<div>Hello John</div>");

		await act(() => {
			name.value = "Jane";
		});
		expect(scratch.innerHTML).to.equal("<div>Hello Jane</div>");
	});

	it("works with the `using` keyword", async () => {
		const { App } = await createComponent(
			`
			import { useSignals } from "@preact/signals-react/runtime";

			export function App({ name }) {
				using _ = useSignals();
				return <div>Hello {name.value}</div>;
			}`,
			// Disable our babel plugin for this example so the explicit resource management plugin handles this case
			{ mode: "manual" }
		);

		const name = signal("John");
		await render(<App name={name} />);
		expect(scratch.innerHTML).to.equal("<div>Hello John</div>");

		await act(() => {
			name.value = "Jane";
		});
		expect(scratch.innerHTML).to.equal("<div>Hello Jane</div>");
	});
});
