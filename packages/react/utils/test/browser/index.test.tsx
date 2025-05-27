import { For, Show, useSignalRef } from "../../src";
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
		it("Should reactively show an element", async () => {
			const toggle = signal(false)!;
			const Paragraph = (p: any) => <p>{p.children}</p>;
			await act(() => {
				render(
					<Show when={toggle} fallback={<Paragraph>Hiding</Paragraph>}>
						<Paragraph>Showing</Paragraph>
					</Show>
				);
			});
			expect(scratch.innerHTML).to.eq("<p>Hiding</p>");

			await act(() => {
				toggle.value = true;
			});
			expect(scratch.innerHTML).to.eq("<p>Showing</p>");
		});
	});

	describe("<For />", () => {
		it("Should iterate over a list of signals", async () => {
			const list = signal<Array<string>>([])!;
			const Paragraph = (p: any) => <p>{p.children}</p>;
			await act(() => {
				render(
					<For each={list} fallback={<Paragraph>No items</Paragraph>}>
						{item => <Paragraph key={item}>{item}</Paragraph>}
					</For>
				);
			});
			expect(scratch.innerHTML).to.eq("<p>No items</p>");

			await act(() => {
				list.value = ["foo", "bar"];
			});
			expect(scratch.innerHTML).to.eq("<p>foo</p><p>bar</p>");
		});
	});

	describe("useSignalRef", () => {
		it("should work", async () => {
			let ref;
			const Paragraph = (p: any) => {
				ref = useSignalRef(null);
				return p.type === "span" ? (
					<span ref={ref}>{p.children}</span>
				) : (
					<p ref={ref}>{p.children}</p>
				);
			};
			await act(() => {
				render(<Paragraph type="p">1</Paragraph>);
			});
			expect(scratch.innerHTML).to.eq("<p>1</p>");
			expect((ref as any).value instanceof HTMLParagraphElement).to.eq(true);

			await act(() => {
				render(<Paragraph type="span">1</Paragraph>);
			});
			expect(scratch.innerHTML).to.eq("<span>1</span>");
			expect((ref as any).value instanceof HTMLSpanElement).to.eq(true);
		});
	});
});
