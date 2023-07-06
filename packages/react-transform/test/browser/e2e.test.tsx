// @ts-expect-error - missing types
import syntaxJsx from "@babel/plugin-syntax-jsx";
// @ts-expect-error - missing types
import transformReactJsx from "@babel/plugin-transform-react-jsx";
import { transform } from "@babel/standalone";
import { signal } from "@preact/signals-core";
import { useSignals } from "@preact/signals-react/runtime";
import React, { createElement } from "react";
import {
	Root,
	createRoot,
	act,
	checkHangingAct,
	getConsoleErrorSpy,
	checkConsoleErrorLogs,
} from "../../../react/test/shared/utils";
import signalsTransform, { PluginOptions } from "../../src/index";

function transformCode(code: string, options?: PluginOptions) {
	const signalsPluginConfig: any[] = [signalsTransform];
	if (options) {
		signalsPluginConfig.push(options);
	}

	const result = transform(code, {
		plugins: [signalsPluginConfig, syntaxJsx, transformReactJsx],
	});

	return result?.code || "";
}

function createComponent(code: string, options?: PluginOptions) {
	// Remove the `import { useSignals } from "@preact/signals-react/runtime";`
	// line since we are compiling code on the fly and can't use import statements.
	const transformedCode = transformCode(code, options)
		.trim()
		.split("\n")
		.slice(1)
		.join("\n");

	const factory = new Function(
		"React",
		"_useSignals",
		`return ${transformedCode}`
	);
	return factory(React, useSignals);
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
		const App = createComponent(`
			function App({ name }) {
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
});
