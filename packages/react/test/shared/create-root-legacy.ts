import { render, unmountComponentAtNode } from "react-dom";

export interface Root {
	render(element: JSX.Element | null): void;
	unmount(): void;
}

let createRootCache: ((container: Element) => Root) | undefined;
export function createRoot(container: Element): Root {
	if (!createRootCache) {
		createRootCache = (container: Element) => ({
			render(element: JSX.Element) {
				render(element, container);
			},
			unmount() {
				unmountComponentAtNode(container);
			},
		});
	}

	return createRootCache(container);
}
