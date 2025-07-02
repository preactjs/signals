import { signal } from "@preact/signals";
import { For, Show, useSignalRef } from "@preact/signals/utils";
import { render, createElement } from "preact";
import { act } from "preact/test-utils";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

describe("@preact/signals-utils", () => {
	let scratch: HTMLDivElement;

	beforeEach(async () => {
		scratch = document.createElement("div");
		document.body.appendChild(scratch);
	});

	afterEach(async () => {
		render(null, scratch);
	});

	describe("<Show />", () => {
		it("Should reactively show an element", () => {
			const toggle = signal(false)!;
			const Paragraph = (props: any) => <p>{props.children}</p>;
			act(() => {
				render(
					<Show when={toggle} fallback={<Paragraph>Hiding</Paragraph>}>
						<Paragraph>Showing</Paragraph>
					</Show>,
					scratch
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
					</For>,
					scratch
				);
			});
			expect(scratch.innerHTML).to.eq("<p>No items</p>");

			act(() => {
				list.value = ["foo", "bar"];
			});
			expect(scratch.innerHTML).to.eq("<p>foo</p><p>bar</p>");
		});
	});

	describe("useSignalRef", () => {
		it("should work", () => {
			let ref;
			const Paragraph = (p: any) => {
				ref = useSignalRef(null);
				return p.type === "span" ? (
					<span ref={ref}>{p.children}</span>
				) : (
					<p ref={ref}>{p.children}</p>
				);
			};
			act(() => {
				render(<Paragraph type="p">1</Paragraph>, scratch);
			});
			expect(scratch.innerHTML).to.eq("<p>1</p>");
			expect((ref as any).value instanceof HTMLParagraphElement).to.eq(true);

			act(() => {
				render(<Paragraph type="span">1</Paragraph>, scratch);
			});
			expect(scratch.innerHTML).to.eq("<span>1</span>");
			expect((ref as any).value instanceof HTMLSpanElement).to.eq(true);
		});
	});
});
