import { expect } from "chai";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { signal } from "@preact/signals-react";

console.log(signal);

describe("renderToStaticMarkup", () => {
	it("should render a simple component", () => {
		const element = <div>Hello World</div>;
		expect(renderToStaticMarkup(element)).to.equal("<div>Hello World</div>");
	});
});
