import { mountSignalsTests } from "../shared/mounting";
import {
	Root,
	createRoot,
	act,
	getConsoleErrorSpy,
	checkConsoleErrorLogs,
} from "../shared/utils";

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
		getConsoleErrorSpy().resetHistory();
	});

	afterEach(async () => {
		scratch.remove();
		checkConsoleErrorLogs();
	});

	mountSignalsTests(render);
});
