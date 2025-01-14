import { signal, useSignalEffect } from "@preact/signals-react";
import { useSignals } from "@preact/signals-react/runtime";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mountSignalsTests } from "../shared/mounting";

describe("renderToStaticMarkup", () => {
	mountSignalsTests(el => Promise.resolve(renderToStaticMarkup(el)));

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

	it("should clean up signal dependencies after executing", async () => {
		const getTargets = (s: any): any => s.t ?? s._targets;

		const sig = signal(0);
		function App() {
			const effectStore = useSignals(/* MANAGED_COMPONENT */ 1);
			try {
				return <p>{sig.value}</p>;
			} finally {
				effectStore.f();
			}
		}

		expect(getTargets(sig)).to.be.undefined;

		const html = renderToStaticMarkup(<App />);
		expect(html).to.equal("<p>0</p>");

		await Promise.resolve();
		expect(getTargets(sig)).to.be.undefined;
	});
});
