// @ts-ignore-next-line
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { signal } from "@preact/signals-react";
import { createElement } from "react";
import { Route, Routes, MemoryRouter } from "react-router-dom";

import { createRoot, Root } from "react-dom/client";
import { act, checkHangingAct } from "./utils";

describe("@preact/signals-react", () => {
	let scratch: HTMLDivElement;
	let root: Root;
	async function render(element: Parameters<Root["render"]>[0]) {
		await act(() => root.render(element));
	}

	beforeEach(() => {
		scratch = document.createElement("div");
		root = createRoot(scratch);
	});

	afterEach(async () => {
		checkHangingAct();
		await act(() => root.unmount());
	});

	describe("react-router-dom", () => {
		it("Route component should render", async () => {
			const name = signal("World")!;

			function App() {
				return (
					<MemoryRouter>
						<Routes>
							<Route path="/page1" element={<div>Page 1</div>}></Route>
							<Route path="*" element={<div>Hello {name}!</div>}></Route>
						</Routes>
					</MemoryRouter>
				);
			}

			await render(<App />);

			expect(scratch.innerHTML).to.equal("<div>Hello World!</div>");
		});
	});
});
