import { computed, signal } from "@preact/signals";
import { For, Show, useSignalRef } from "@preact/signals/utils";
import { render, createElement } from "preact";
import { act } from "preact/test-utils";

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

		it("Should reactively show an inline element w/ nested reactivity", () => {
			const count = signal(0);
			const visible = computed(() => count.value > 0)!;
			const Paragraph = (props: any) => <p>{props.children}</p>;
			act(() => {
				render(
					<Show when={visible} fallback={<Paragraph>Hiding</Paragraph>}>
						<Paragraph>Showing {count}</Paragraph>
					</Show>,
					scratch
				);
			});
			expect(scratch.innerHTML).to.eq("<p>Hiding</p>");

			act(() => {
				count.value = 1;
			});
			expect(scratch.innerHTML).to.eq("<p>Showing 1</p>");

			act(() => {
				count.value = 2;
			});
			expect(scratch.innerHTML).to.eq("<p>Showing 2</p>");
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

		it("Should iterate over a list of signals w/ nested reactivity", () => {
			const list = signal<Array<string>>([])!;
			const test = signal("foo");
			const Paragraph = (p: any) => <p>{p.children}</p>;
			act(() => {
				render(
					<For each={list} fallback={<Paragraph>No items</Paragraph>}>
						{item => (
							<Paragraph key={item}>
								{item}-{test.value}
							</Paragraph>
						)}
					</For>,
					scratch
				);
			});
			expect(scratch.innerHTML).to.eq("<p>No items</p>");

			act(() => {
				list.value = ["foo", "bar"];
			});
			expect(scratch.innerHTML).to.eq("<p>foo-foo</p><p>bar-foo</p>");

			act(() => {
				test.value = "baz";
			});
			expect(scratch.innerHTML).to.eq("<p>foo-baz</p><p>bar-baz</p>");

			act(() => {
				list.value = ["foo", "bar", "qux"];
			});
			expect(scratch.innerHTML).to.eq(
				"<p>foo-baz</p><p>bar-baz</p><p>qux-baz</p>"
			);
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
