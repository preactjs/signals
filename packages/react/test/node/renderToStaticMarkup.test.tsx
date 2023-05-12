import { signal, useSignalEffect } from "@preact/signals-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mountSignalsTests } from "../shared/mounting";

describe("renderToStaticMarkup", () => {
	mountSignalsTests(renderToStaticMarkup);

	it("should not invoke useSignalEffect", async () => {
		const spy = sinon.spy();
		const sig = signal("foo");

		function App() {
			useSignalEffect(() => spy(sig.value));
			return <p>{sig.value}</p>;
		}

		const html = await renderToStaticMarkup(<App />);
		expect(html).to.equal("<p>foo</p>");
		expect(spy.called).to.be.false;
	});
});
