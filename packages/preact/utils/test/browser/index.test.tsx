import { computed, signal } from "@preact/signals";
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

		it("Should preserve signal props after unmount/remount cycle", () => {
			const counter = signal(0);
			const visible = computed(() => counter.value >= 1 && counter.value <= 2);
			const cls = computed(() => `val-${counter.value}`);
			act(() => {
				render(
					<Show when={visible}>
						<div class={cls}>content</div>
					</Show>,
					scratch
				);
			});
			// counter=0, not visible
			expect(scratch.innerHTML).to.eq("");

			act(() => {
				counter.value = 1;
			});
			// counter=1, visible first time
			expect(scratch.innerHTML).to.eq('<div class="val-1">content</div>');

			act(() => {
				counter.value = 2;
			});
			// counter=2, still visible, class updates
			expect(scratch.innerHTML).to.eq('<div class="val-2">content</div>');

			act(() => {
				counter.value = 0;
			});
			// counter=0, unmounted
			expect(scratch.innerHTML).to.eq("");

			act(() => {
				counter.value = 1;
			});
			// counter=1, remounted — signal props must still work
			expect(scratch.innerHTML).to.eq('<div class="val-1">content</div>');

			act(() => {
				counter.value = 2;
			});
			// counter=2, class should update after remount
			expect(scratch.innerHTML).to.eq('<div class="val-2">content</div>');
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

		it("Should use getKey for stable identity on item removal", () => {
			const list = signal([
				{ id: "a", label: "Alice" },
				{ id: "b", label: "Bob" },
				{ id: "c", label: "Carol" },
			]);
			const Paragraph = (p: any) => <p>{p.children}</p>;
			act(() => {
				render(
					<For each={list} getKey={item => item.id}>
						{item => <Paragraph>{item.label}</Paragraph>}
					</For>,
					scratch
				);
			});
			expect(scratch.innerHTML).to.eq("<p>Alice</p><p>Bob</p><p>Carol</p>");

			// Remove middle item
			act(() => {
				list.value = [
					{ id: "a", label: "Alice" },
					{ id: "c", label: "Carol" },
				];
			});
			expect(scratch.innerHTML).to.eq("<p>Alice</p><p>Carol</p>");
		});

		it("Should handle duplicate values with getKey", () => {
			const list = signal([
				{ id: 1, name: "foo" },
				{ id: 2, name: "foo" },
			]);
			const Paragraph = (p: any) => <p>{p.children}</p>;
			act(() => {
				render(
					<For each={list} getKey={item => item.id}>
						{item => <Paragraph>{item.name}</Paragraph>}
					</For>,
					scratch
				);
			});
			expect(scratch.innerHTML).to.eq("<p>foo</p><p>foo</p>");
		});

		it("Should reorder correctly with getKey", () => {
			const list = signal([
				{ id: "x", label: "X" },
				{ id: "y", label: "Y" },
				{ id: "z", label: "Z" },
			]);
			const Paragraph = (p: any) => <p>{p.children}</p>;
			act(() => {
				render(
					<For each={list} getKey={item => item.id}>
						{item => <Paragraph>{item.label}</Paragraph>}
					</For>,
					scratch
				);
			});
			expect(scratch.innerHTML).to.eq("<p>X</p><p>Y</p><p>Z</p>");

			// Reverse order
			act(() => {
				list.value = [
					{ id: "z", label: "Z" },
					{ id: "y", label: "Y" },
					{ id: "x", label: "X" },
				];
			});
			expect(scratch.innerHTML).to.eq("<p>Z</p><p>Y</p><p>X</p>");
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
