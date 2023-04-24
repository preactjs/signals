import * as preact from "preact";
import * as preactHooks from "preact/hooks";
import * as signalsPreact from "@preact/signals";
import { mountSignalsTests } from "../../../../test/shared/mounting";

describe("@preact/signals-react mounting", () => {
	let scratch: HTMLDivElement;

	async function render(element: JSX.Element | null): Promise<string> {
		preact.render(element, scratch);
		return scratch.innerHTML;
	}

	beforeEach(async () => {
		scratch = document.createElement("div");
		document.body.appendChild(scratch);
	});

	afterEach(async () => {
		scratch.remove();
	});

	mountSignalsTests({ ...preact, ...preactHooks }, signalsPreact, render);
});
