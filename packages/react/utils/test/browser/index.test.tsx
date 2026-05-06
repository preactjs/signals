import {
	For,
	Show,
	useSignalRef,
	useLiveSignal,
} from "@preact/signals-react/utils";
import {
	act,
	checkHangingAct,
	createRoot,
	Root,
} from "../../../test/shared/utils";
import {
	computed,
	Signal,
	signal,
	useSignalEffect,
} from "@preact/signals-react";
import { createElement } from "react";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";
import { useSignals } from "@preact/signals-react/runtime";

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

	describe("useLiveSignal", () => {
		it("should work", async () => {
			const logs: string[] = [];
			const App = (props: { count: number }) => {
				useSignals();
				const count = useLiveSignal(props.count);

				useSignalEffect(() => {
					logs.push("Count is " + count.value);
				});

				return <p>{count.value}</p>;
			};

			await act(() => {
				render(<App count={0} />);
			});
			expect(scratch.innerHTML).to.eq("<p>0</p>");
			expect(logs).to.deep.eq(["Count is 0"]);

			await act(() => {
				render(<App count={1} />);
			});
			expect(scratch.innerHTML).to.eq("<p>1</p>");
			expect(logs).to.deep.eq(["Count is 0", "Count is 1"]);
		});

		it("Should not cause a react error when used in a component that re-renders", async () => {
			const consoleError = vi.spyOn(console, "error");
			const consoleWarn = vi.spyOn(console, "warn");

			const Counter = (props: { count: Signal<number> }) => {
				useSignals();
				return <p>{props.count.value}</p>;
			};

			const App = (props: { count: number }) => {
				const count = useLiveSignal(props.count);
				return (
					<div>
						<Counter count={count} />
						<Counter count={count} />
					</div>
				);
			};

			await act(async () => {
				await render(<App count={0} />);
			});
			expect(scratch.innerHTML).to.eq("<div><p>0</p><p>0</p></div>");

			await act(async () => {
				await render(<App count={1} />);
			});
			expect(scratch.innerHTML).to.eq("<div><p>1</p><p>1</p></div>");
			expect(consoleError).toBeCalledTimes(0);
			expect(consoleWarn).toBeCalledTimes(0);
		});
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

		it("Should use getKey for stable identity on item removal", async () => {
			const list = signal([
				{ id: "a", label: "Alice" },
				{ id: "b", label: "Bob" },
				{ id: "c", label: "Carol" },
			]);
			const Paragraph = (p: any) => <p>{p.children}</p>;
			await act(() => {
				render(
					<For each={list} getKey={item => item.id}>
						{item => <Paragraph>{item.label}</Paragraph>}
					</For>
				);
			});
			expect(scratch.innerHTML).to.eq("<p>Alice</p><p>Bob</p><p>Carol</p>");

			// Remove middle item
			await act(() => {
				list.value = [
					{ id: "a", label: "Alice" },
					{ id: "c", label: "Carol" },
				];
			});
			expect(scratch.innerHTML).to.eq("<p>Alice</p><p>Carol</p>");
		});

		it("Should handle duplicate values with getKey", async () => {
			const list = signal([
				{ id: 1, name: "foo" },
				{ id: 2, name: "foo" },
			]);
			const Paragraph = (p: any) => <p>{p.children}</p>;
			await act(() => {
				render(
					<For each={list} getKey={item => item.id}>
						{item => <Paragraph>{item.name}</Paragraph>}
					</For>
				);
			});
			expect(scratch.innerHTML).to.eq("<p>foo</p><p>foo</p>");
		});

		it("Should reorder correctly with getKey", async () => {
			const list = signal([
				{ id: "x", label: "X" },
				{ id: "y", label: "Y" },
				{ id: "z", label: "Z" },
			]);
			const Paragraph = (p: any) => <p>{p.children}</p>;
			await act(() => {
				render(
					<For each={list} getKey={item => item.id}>
						{item => <Paragraph>{item.label}</Paragraph>}
					</For>
				);
			});
			expect(scratch.innerHTML).to.eq("<p>X</p><p>Y</p><p>Z</p>");

			// Reverse order
			await act(() => {
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
