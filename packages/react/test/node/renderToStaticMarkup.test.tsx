import { expect } from "chai";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { signal } from "@preact/signals-react";

console.log(signal);

describe("renderToStaticMarkup", () => {
	it("should render a simple component", () => {
		function App() {
			return <div>Hello World</div>;
		}
		expect(renderToStaticMarkup(<App />)).to.equal("<div>Hello World</div>");
	});

	it("should render a component with a signal as text", () => {
		const name = signal("World");
		function App() {
			return <div>Hello {name}</div>;
		}

		expect(renderToStaticMarkup(<App />)).to.equal("<div>Hello World</div>");
	});
});
