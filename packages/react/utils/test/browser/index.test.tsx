import { For, Show } from "../../src";
import {
	act,
	checkHangingAct,
	createRoot,
	Root,
} from "../../../test/shared/utils";
import { signal } from "@preact/signals-react";
import { createElement } from "react";

describe("@preact/signals-react-utils", () => {
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

	describe("<Show />", () => {
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

	describe("<For />", () => {
		it("Should iterate over a list of signals", () => {
			const list = signal<Array<string>>([])!;
			const Paragraph = (p: any) => <p>{p.children}</p>;
			act(() => {
				render(
					<For each={list} fallback={<Paragraph>No items</Paragraph>}>
						{item => <Paragraph key={item}>{item}</Paragraph>}
					</For>
				);
			});
			expect(scratch.innerHTML).to.eq("<p>No items</p>");

			act(() => {
				list.value = ["foo", "bar"];
			});
			expect(scratch.innerHTML).to.eq("<p>foo</p><p>bar</p>");
		});
	});
});
