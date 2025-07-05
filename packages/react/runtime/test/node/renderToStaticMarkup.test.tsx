import { signal, useSignalEffect } from "@preact/signals-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mountSignalsTests } from "../../../test/shared/mounting";
import { describe, it, expect, vi } from "vitest";

describe("@preact/signals-react/runtime", () => {
	describe("renderToStaticMarkup", () => {
		mountSignalsTests(el => Promise.resolve(renderToStaticMarkup(el)));

		it("should not invoke useSignalEffect", async () => {
			const spy = vi.fn();
			const sig = signal("foo");

			function App() {
				useSignalEffect(() => spy(sig.value));
				return <p>{sig.value}</p>;
			}

			const html = await renderToStaticMarkup(<App />);
			expect(html).to.equal("<p>foo</p>");
			expect(spy).not.toHaveBeenCalled();
		});
	});
});
