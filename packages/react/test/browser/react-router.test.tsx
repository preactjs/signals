// @ts-ignore-next-line
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { signal } from "@preact/signals-react";
import { createElement } from "react";
import * as ReactRouter from "react-router-dom";

import { act, checkHangingAct, createRoot, Root } from "../shared/utils";

const MemoryRouter = ReactRouter.MemoryRouter;
const Routes = ReactRouter.Routes
	? ReactRouter.Routes
	: (ReactRouter as any).Switch; // react-router-dom v5

// @ts-expect-error We are doing a check for react-router-dom v5 vs v6 here, so
// while TS thinks ReactRouter.Routes will always be here, it isn't in v5.
const Route = ReactRouter.Routes
	? ReactRouter.Route
	: // react-router-dom v5 requires the element prop to be passed as children.
	  ({ element, ...props }: any) => (
			<ReactRouter.Route {...props}>{element}</ReactRouter.Route>
	  );

describe("@preact/signals-react", () => {
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
