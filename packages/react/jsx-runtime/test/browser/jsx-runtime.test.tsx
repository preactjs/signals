// @ts-expect-error
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { computed, signal } from "@preact/signals-core";
import { Fragment, jsx, jsxs } from "@preact/signals-react/jsx-runtime";
import { jsxDEV } from "@preact/signals-react/jsx-dev-runtime";
import { useSignalRef } from "@preact/signals-react/utils";
import { createRef, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	act,
	checkConsoleErrorLogs,
	checkHangingAct,
	createRoot,
	getConsoleErrorSpy,
	Root,
} from "../../../test/shared/utils";

describe("@preact/signals-react/jsx-runtime", () => {
	let scratch: HTMLDivElement;
	let root: Root;
	let render: Root["render"];

	beforeEach(async () => {
		scratch = document.createElement("div");
		document.body.appendChild(scratch);

		const realRoot = await createRoot(scratch);
		root = {
			render: element => act(() => realRoot.render(element)),
			unmount: () => act(() => realRoot.unmount()),
		};

		render = root.render.bind(root);
		getConsoleErrorSpy().mockClear();
	});

	afterEach(async () => {
		await act(() => root.unmount());
		scratch.remove();

		checkConsoleErrorLogs();
		checkHangingAct();
	});

	it("should bind signal props on DOM elements and update reactively without rerendering parent", async () => {
		const rawHeight = signal(250);
		const height = computed(() => rawHeight.value);
		const parentRender = vi.fn();

		function LoginIframeElement() {
			parentRender();
			return jsx("iframe", { title: "Shop Pay", height });
		}

		await render(jsx(LoginIframeElement, {}));
		const iframe = scratch.firstElementChild as HTMLIFrameElement;
		expect(iframe.tagName).to.equal("IFRAME");
		expect(iframe.getAttribute("title")).to.equal("Shop Pay");
		expect(iframe.getAttribute("height")).to.equal("250");
		expect(parentRender).toHaveBeenCalledOnce();

		await act(() => {
			rawHeight.value = 100;
		});
		expect(iframe.getAttribute("height")).to.equal("100");
		expect(parentRender).toHaveBeenCalledOnce();

		await act(() => {
			rawHeight.value = 420;
		});
		expect(iframe.getAttribute("height")).to.equal("420");
		expect(parentRender).toHaveBeenCalledOnce();
	});

	it("should update className, style, aria-*, data-*, and boolean attributes", async () => {
		const className = signal("foo");
		const style = signal({ opacity: "0.5" });
		const ariaLabel = signal("first");
		const dataId = signal("a");
		const disabled = signal(false);

		await render(
			jsx("button", {
				className,
				style,
				"aria-label": ariaLabel,
				"data-id": dataId,
				disabled,
				children: "Click",
			})
		);

		const btn = scratch.firstElementChild as HTMLButtonElement;
		expect(btn.className).to.equal("foo");
		expect(btn.style.opacity).to.equal("0.5");
		expect(btn.getAttribute("aria-label")).to.equal("first");
		expect(btn.getAttribute("data-id")).to.equal("a");
		expect(btn.disabled).to.equal(false);

		await act(() => {
			className.value = "bar";
			style.value = { opacity: "1" };
			ariaLabel.value = "second";
			dataId.value = "b";
			disabled.value = true;
		});

		expect(btn.className).to.equal("bar");
		expect(btn.style.opacity).to.equal("1");
		expect(btn.getAttribute("aria-label")).to.equal("second");
		expect(btn.getAttribute("data-id")).to.equal("b");
		expect(btn.disabled).to.equal(true);
	});

	it("should forward object refs, callback refs, and useSignalRef", async () => {
		const cls = signal("a");
		const objRef = createRef<HTMLDivElement>();
		const cbRef = vi.fn();
		let sigRefValue: HTMLSpanElement | null = null;

		function App() {
			const sigRef = useSignalRef<HTMLSpanElement | null>(null);
			return jsxs(Fragment, {
				children: [
					jsx("div", { ref: objRef, className: cls }),
					jsx("p", { ref: cbRef, className: cls }),
					jsx("span", {
						ref: (el: HTMLSpanElement | null) => {
							sigRef.current = el;
							sigRefValue = sigRef.peek();
						},
						className: cls,
					}),
				],
			});
		}

		await render(jsx(App, {}));
		expect(objRef.current).to.be.instanceOf(HTMLDivElement);
		expect(objRef.current!.className).to.equal("a");
		expect(cbRef).toHaveBeenCalledWith(scratch.querySelector("p"));
		expect(sigRefValue).to.equal(scratch.querySelector("span"));

		await act(() => {
			cls.value = "b";
		});
		expect(objRef.current!.className).to.equal("b");
	});

	it("should pass useSignalRef directly without unwrapping it", async () => {
		const cls = signal("initial");
		let capturedRef: ReturnType<
			typeof useSignalRef<HTMLDivElement | null>
		> | null = null;

		function App() {
			const sigRef = useSignalRef<HTMLDivElement | null>(null);
			capturedRef = sigRef;
			return jsxs(Fragment, {
				children: [
					jsx("div", { ref: sigRef, id: "only-ref" }),
					jsx("div", { ref: sigRef, className: cls, id: "with-signal-prop" }),
				],
			});
		}

		await render(jsx(App, {}));
		expect(capturedRef!.peek()).to.be.instanceOf(HTMLDivElement);
		expect(capturedRef!.peek()!.id).to.equal("with-signal-prop");
		expect(capturedRef!.peek()!.className).to.equal("initial");

		await act(() => {
			cls.value = "updated";
		});
		expect(capturedRef!.peek()!.className).to.equal("updated");
	});

	it("should support jsxs static children and Signal children alongside signal props", async () => {
		const cls = signal("wrap");
		const text = signal("hello");

		await render(
			jsxs("div", {
				className: cls,
				children: [
					jsx("span", { children: "prefix:" }),
					jsx("span", { children: text }),
				],
			})
		);

		expect(scratch.innerHTML).to.equal(
			'<div class="wrap"><span>prefix:</span><span>hello</span></div>'
		);

		await act(() => {
			cls.value = "wrap-2";
		});
		expect(scratch.innerHTML).to.equal(
			'<div class="wrap-2"><span>prefix:</span><span>hello</span></div>'
		);

		await act(() => {
			text.value = "world";
		});
		expect(scratch.innerHTML).to.equal(
			'<div class="wrap-2"><span>prefix:</span><span>world</span></div>'
		);
	});

	it("should preserve key across list reorders", async () => {
		const a = signal("a1");
		const b = signal("b1");

		function List({ reverse }: { reverse: boolean }) {
			const items = reverse
				? [
						jsx("div", { className: b, children: "B" }, "b"),
						jsx("div", { className: a, children: "A" }, "a"),
					]
				: [
						jsx("div", { className: a, children: "A" }, "a"),
						jsx("div", { className: b, children: "B" }, "b"),
					];
			return jsx("section", { children: items });
		}

		await render(jsx(List, { reverse: false }));
		const section = scratch.firstElementChild!;
		const firstNode = section.children[0];
		const secondNode = section.children[1];
		expect(firstNode.className).to.equal("a1");
		expect(secondNode.className).to.equal("b1");

		await render(jsx(List, { reverse: true }));
		expect(section.children[0]).to.equal(secondNode);
		expect(section.children[1]).to.equal(firstNode);

		await act(() => {
			a.value = "a2";
		});
		expect(firstNode.className).to.equal("a2");
	});

	it("should switch subscriptions when signal prop reference changes", async () => {
		const sigA = signal("a");
		const sigB = signal("b");

		function App({ useB }: { useB: boolean }) {
			return jsx("div", { className: useB ? sigB : sigA });
		}

		await render(jsx(App, { useB: false }));
		expect(scratch.innerHTML).to.equal('<div class="a"></div>');

		await render(jsx(App, { useB: true }));
		expect(scratch.innerHTML).to.equal('<div class="b"></div>');

		await act(() => {
			sigA.value = "a2";
		});
		expect(scratch.innerHTML).to.equal('<div class="b"></div>');

		await act(() => {
			sigB.value = "b2";
		});
		expect(scratch.innerHTML).to.equal('<div class="b2"></div>');
	});

	it("should not unwrap signal props passed to custom components", async () => {
		const sig = signal("raw");
		let received: unknown;

		function Custom({ value }: { value: typeof sig }) {
			received = value;
			return jsx("span", { children: value.peek() });
		}

		await render(jsx(Custom, { value: sig }));
		expect(received).to.equal(sig);
		expect(scratch.innerHTML).to.equal("<span>raw</span>");
	});

	it("should work consistently in StrictMode", async () => {
		const cls = signal("s1");

		await render(
			jsx(StrictMode, {
				children: jsx("div", { className: cls }),
			})
		);
		expect(scratch.innerHTML).to.equal('<div class="s1"></div>');

		await act(() => {
			cls.value = "s2";
		});
		expect(scratch.innerHTML).to.equal('<div class="s2"></div>');
	});

	it("should support jsxDEV with signal props, refs, keys, and static children", async () => {
		const cls = signal("dev-1");
		const ref = createRef<HTMLDivElement>();

		await render(
			jsxDEV(
				"div",
				{
					ref,
					className: cls,
					children: [
						jsxDEV("span", { children: "one" }, undefined, false),
						jsxDEV("span", { children: "two" }, undefined, false),
					],
				},
				"dev-key",
				true
			)
		);

		expect(ref.current).to.be.instanceOf(HTMLDivElement);
		expect(scratch.innerHTML).to.equal(
			'<div class="dev-1"><span>one</span><span>two</span></div>'
		);

		await act(() => {
			cls.value = "dev-2";
		});
		expect(scratch.innerHTML).to.equal(
			'<div class="dev-2"><span>one</span><span>two</span></div>'
		);
	});
});
