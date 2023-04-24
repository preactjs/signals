import React, { createElement } from "react";
import * as signalsReact from "@preact/signals-react";
import { mountSignalsTests } from "../../../../test/shared/mounting";
import { Root, createRoot, act } from "../shared/utils";

const { signal } = signalsReact;

describe("@preact/signals-react mounting", () => {
	let scratch: HTMLDivElement;
	let root: Root;

	async function render(element: JSX.Element | null): Promise<string> {
		await act(() => root.render(element));
		return scratch.innerHTML;
	}

	beforeEach(async () => {
		scratch = document.createElement("div");
		document.body.appendChild(scratch);
		root = await createRoot(scratch);
	});

	afterEach(async () => {
		scratch.remove();
	});

	mountSignalsTests(React, signalsReact, render);

	it("should properly mount in strict mode", async () => {
		const sig = signal(-1);

		const Test = () => <p>{sig.value}</p>;
		const App = () => (
			<React.StrictMode>
				<Test />
			</React.StrictMode>
		);

		const html = await render(<App />);
		expect(html).to.equal("<p>-1</p>");
	});
});
