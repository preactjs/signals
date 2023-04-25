import * as signalsReact from "@preact/signals-react";
import { expect } from "chai";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sinon from "sinon";
import { mountSignalsTests } from "../../../../test/shared/mounting";

describe("@preact/signals-react renderToStaticMarkup", () => {
	const { signal, useSignalEffect } = signalsReact;

	mountSignalsTests(React, signalsReact, renderToStaticMarkup);

	it("should encode HTML entities", async () => {
		const sig = signal(`hello & " <p>world!</p>`);
		const html = renderToStaticMarkup(<p>{sig}</p>);
		expect(html).to.equal(
			`<p>hello &amp; &quot; &lt;p&gt;world!&lt;/p&gt;</p>`
		);
	});

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
