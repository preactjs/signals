import { For, Show, useSignalRef } from "@preact/signals-react/utils";
import {
	act,
	checkHangingAct,
	createRoot,
	Root,
} from "../../../test/shared/utils";
import { computed, signal } from "@preact/signals-react";
import { createElement } from "react";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

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

		it("Should reactively show an inline element w/ nested reactivity", async () => {
			const count = signal(0);
			const visible = computed(() => count.value > 0)!;
			const Paragraph = (props: any) => <p>{props.children}</p>;
			await act(() => {
				render(
					<Show when={visible} fallback={<Paragraph>Hiding</Paragraph>}>
						<Paragraph>Showing {count}</Paragraph>
					</Show>
				);
			});
			expect(scratch.innerHTML).to.eq("<p>Hiding</p>");

			await act(() => {
				count.value = 1;
			});
			expect(scratch.innerHTML).to.eq("<p>Showing 1</p>");

			await act(() => {
				count.value = 2;
			});
			expect(scratch.innerHTML).to.eq("<p>Showing 2</p>");
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

		it("Should iterate over a list of signals w/ nested reactivity", async () => {
			const list = signal<Array<string>>([])!;
			const test = signal("foo");
			const Paragraph = (p: any) => <p>{p.children}</p>;
			await act(() => {
				render(
					<For each={list} fallback={<Paragraph>No items</Paragraph>}>
						{item => (
							<Paragraph key={item}>
								{item}-{test.value}
							</Paragraph>
						)}
					</For>
				);
			});
			expect(scratch.innerHTML).to.eq("<p>No items</p>");

			await act(() => {
				list.value = ["foo", "bar"];
			});
			expect(scratch.innerHTML).to.eq("<p>foo-foo</p><p>bar-foo</p>");

			await act(() => {
				test.value = "baz";
			});
			expect(scratch.innerHTML).to.eq("<p>foo-baz</p><p>bar-baz</p>");

			await act(() => {
				list.value = ["foo", "bar", "qux"];
			});
			expect(scratch.innerHTML).to.eq(
				"<p>foo-baz</p><p>bar-baz</p><p>qux-baz</p>"
			);
		});

		it("Should respect child keys for stable identity on item removal", async () => {
			const list = signal([
				{ id: "a", label: "Alice" },
				{ id: "b", label: "Bob" },
				{ id: "c", label: "Carol" },
			]);
			const getInputs = () =>
				Array.from(scratch.querySelectorAll<HTMLInputElement>("input"));
			await act(() => {
				render(
					<For each={list}>
						{item => <input key={item.id} defaultValue={item.label} />}
					</For>
				);
			});
			expect(getInputs().map(input => input.value)).to.deep.eq([
				"Alice",
				"Bob",
				"Carol",
			]);

			getInputs()[1].value = "Bobby";

			// Remove middle item
			await act(() => {
				list.value = [
					{ id: "a", label: "Alice" },
					{ id: "c", label: "Carol" },
				];
			});
			expect(getInputs().map(input => input.value)).to.deep.eq([
				"Alice",
				"Carol",
			]);
		});

		it("Should handle duplicate values with child keys", async () => {
			const list = signal([
				{ id: 1, name: "foo" },
				{ id: 2, name: "foo" },
			]);
			const Paragraph = (p: any) => <p>{p.children}</p>;
			await act(() => {
				render(
					<For each={list}>
						{item => <Paragraph key={item.id}>{item.name}</Paragraph>}
					</For>
				);
			});
			expect(scratch.innerHTML).to.eq("<p>foo</p><p>foo</p>");
		});

		it("Should reorder correctly with child keys", async () => {
			const list = signal([
				{ id: "x", label: "X" },
				{ id: "y", label: "Y" },
				{ id: "z", label: "Z" },
			]);
			const getInputs = () =>
				Array.from(scratch.querySelectorAll<HTMLInputElement>("input"));
			await act(() => {
				render(
					<For each={list}>
						{item => <input key={item.id} defaultValue={item.label} />}
					</For>
				);
			});
			const initialInputs = getInputs();
			expect(initialInputs.map(input => input.value)).to.deep.eq([
				"X",
				"Y",
				"Z",
			]);

			// Reverse order
			await act(() => {
				list.value = [
					{ id: "z", label: "Z" },
					{ id: "y", label: "Y" },
					{ id: "x", label: "X" },
				];
			});
			const reorderedInputs = getInputs();
			expect(reorderedInputs.map(input => input.value)).to.deep.eq([
				"Z",
				"Y",
				"X",
			]);
			expect(reorderedInputs[0]).to.eq(initialInputs[2]);
			expect(reorderedInputs[1]).to.eq(initialInputs[1]);
			expect(reorderedInputs[2]).to.eq(initialInputs[0]);
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
