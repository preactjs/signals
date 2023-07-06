import * as signalsCore from "@preact/signals-core";
import { signal } from "@preact/signals-core";
import { PluginOptions } from "@preact/signals-react-transform";
import * as signalsRuntime from "@preact/signals-react/runtime";
import React, { createElement } from "react";
import {
	Root,
	act,
	checkConsoleErrorLogs,
	checkHangingAct,
	createRoot,
	getConsoleErrorSpy,
} from "../../../react/test/shared/utils";

const modules: Record<string, any> = {
	"@preact/signals-core": signalsCore,
	"@preact/signals-react/runtime": signalsRuntime,
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
	// namespace by a test helper we've included in Karma.
	let transformedCode = transformSignalCode(code, options).trim();

	const exports: any = {};
	const wrapper = new Function("React", "exports", "require", transformedCode);
	wrapper(React, exports, testRequire);
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
				debugger;
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
});
