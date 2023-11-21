// @ts-expect-error
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { mountSignalsTests } from "../../../test/shared/mounting";
import {
	act,
	getConsoleErrorSpy,
	checkConsoleErrorLogs,
	createRoot,
	type Root,
} from "../../../test/shared/utils.js";

describe("@preact/signals-react/runtime", () => {
	describe("mounting", () => {
		let scratch: HTMLDivElement;
		let root: Root;

		async function render(element: JSX.Element): Promise<string> {
			await act(() => {
				root.render(element);
			});
			return scratch.innerHTML;
		}

		beforeEach(async () => {
			scratch = document.createElement("div");
			document.body.appendChild(scratch);
			getConsoleErrorSpy().resetHistory();

			root = await createRoot(scratch);
		});

		afterEach(async () => {
			scratch.remove();
			checkConsoleErrorLogs();
		});

		mountSignalsTests(render);
	});
});
