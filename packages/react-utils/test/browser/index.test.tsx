import { Show } from "@preact/signals-react-utils";
import { act, checkHangingAct, createRoot, Root } from "../shared/utils";
import { signal } from "@preact/signals-react";
import { createElement } from "react";

describe.only("@preact/signals-react-utils", () => {
	describe("<Show />", () => {
		let scratch: HTMLDivElement;
		let root: Root;
		async function render(element: Parameters<Root["render"]>[0]) {
			await act(() => root.render(element));
		}

		beforeEach(async () => {
			scratch = document.createElement("div");
			document.body.appendChild(scratch);
			root = await createRoot(scratch);
		});

		afterEach(async () => {
			checkHangingAct();
			await act(() => root.unmount());
			scratch.remove();
		});

		it("Should reactively show an element", () => {
			const toggle = signal(false)!;
			const Paragraph = (p: any) => <p>{p.children}</p>;
			act(() => {
				render(
					<Show when={toggle} fallback={<Paragraph>Hiding</Paragraph>}>
						<Paragraph>Showing</Paragraph>
					</Show>
				);
			});
			expect(scratch.innerHTML).to.eq("<p>Hiding</p>");

			act(() => {
				toggle.value = true;
			});
			expect(scratch.innerHTML).to.eq("<p>Showing</p>");
		});
	});
});
