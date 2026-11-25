import { computed, signal } from "@preact/signals-core";
import { jsx, jsxs } from "@preact/signals-react/jsx-runtime";
import { jsxDEV } from "@preact/signals-react/jsx-dev-runtime";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

describe("@preact/signals-react/jsx-runtime SSR", () => {
	it("should unwrap signal props during renderToStaticMarkup and renderToString", () => {
		const height = computed(() => 370);
		const cls = signal("frame");

		expect(
			renderToStaticMarkup(jsx("iframe", { className: cls, height }))
		).to.equal('<iframe class="frame" height="370"></iframe>');

		expect(
			renderToString(
				jsxs("div", {
					className: cls,
					children: [
						jsx("span", { children: "a" }),
						jsx("span", { children: "b" }),
					],
				})
			)
		).to.equal('<div class="frame"><span>a</span><span>b</span></div>');
	});

	it("should unwrap signal props with jsxDEV during SSR", () => {
		const height = signal(440);
		expect(
			renderToStaticMarkup(jsxDEV("iframe", { height }, undefined, false))
		).to.equal('<iframe height="440"></iframe>');
	});
});
