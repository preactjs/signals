import { createElement, Fragment } from "react";
import { signal, createModel } from "@preact/signals-core";
import { useModel } from "@preact/signals-react/runtime";
import {
	act,
	getConsoleErrorSpy,
	checkConsoleErrorLogs,
	createRoot,
	type Root,
} from "../../../test/shared/utils.js";
import {
	describe,
	it,
	expect,
	MockInstance,
	vi,
	beforeEach,
	afterEach,
} from "vitest";

describe("useModel", () => {
	let scratch: HTMLDivElement;
	let root: Root;

	async function render(element: JSX.Element): Promise<string> {
		await act(() => {
			root.render(element);
		});
		return scratch.innerHTML;
	}

	beforeEach(async () => {
		scratch = document.createElement("div");
		document.body.appendChild(scratch);
		getConsoleErrorSpy().mockClear();

		root = await createRoot(scratch);
	});

	afterEach(async () => {
		scratch.remove();
		checkConsoleErrorLogs();
	});

	it("creates model instance using model constructor", async () => {
		const CountModel = createModel(() => ({
			count: signal(0),
			increment() {
				this.count.value++;
			},
		}));

		function Counter() {
			const model = useModel(CountModel);
			return <button onClick={() => model.increment()}>{model.count}</button>;
		}

		await render(<Counter />);
		const button = scratch.querySelector("button")!;

		expect(button.textContent).toBe("0");

		await act(() => button.click());

		expect(button.textContent).toBe("1");
	});

	it("creates model instance using wrapper around model constructor", async () => {
		const CountModel = createModel(() => ({
			count: signal(0),
			increment() {
				this.count.value++;
			},
		}));

		function Counter() {
			const model = useModel(() => new CountModel());
			return <button onClick={() => model.increment()}>{model.count}</button>;
		}

		await render(<Counter />);
		const button = scratch.querySelector("button")!;

		expect(button.textContent).toBe("0");

		await act(() => button.click());

		expect(button.textContent).toBe("1");
	});

	it("creates model instance using wrapper around model constructor with arguments", async () => {
		const CountModel = createModel((initialCount: number) => ({
			count: signal(initialCount),
			increment() {
				this.count.value++;
			},
		}));

		function Counter() {
			const model = useModel(() => new CountModel(5));
			return <button onClick={() => model.increment()}>{model.count}</button>;
		}

		await render(<Counter />);
		const button = scratch.querySelector("button")!;

		expect(button.textContent).toBe("5");

		await act(() => button.click());

		expect(button.textContent).toBe("6");
	});

	it("returns the same instance across multiple renders", async () => {
		const CountModel = createModel(() => ({
			count: signal(0),
			increment() {
				this.count.value++;
			},
		}));

		let modelInstances: any[] = [];

		function Counter() {
			const model = useModel(() => new CountModel());
			modelInstances.push(model);
			return (
				<button onClick={() => model.increment()}>{model.count.value}</button>
			);
		}

		await render(<Counter />);
		const button = scratch.querySelector("button")!;

		expect(button.textContent).toBe("0");
		expect(modelInstances.length).toBe(1);

		await act(() => button.click());

		expect(button.textContent).toBe("1");
		expect(modelInstances.length).toBe(2);
		expect(modelInstances[0]).toBe(modelInstances[1]);
	});

	it("diposes the model on unmount", async () => {
		const CountModel = createModel(() => ({ count: signal(0) }));

		let disposeSpy: MockInstance | undefined;
		function Counter() {
			const model = useModel(CountModel);
			disposeSpy = vi.spyOn(model, Symbol.dispose);
			return <div>{model.count}</div>;
		}

		await render(<Counter />);
		expect(disposeSpy).not.toHaveBeenCalled();

		await act(() => root.unmount());
		expect(disposeSpy).toHaveBeenCalledTimes(1);
	});

	it("disposes the model on unmount when created via a factory function", async () => {
		const CountModel = createModel(() => ({ count: signal(0) }));

		let disposeSpy: MockInstance | undefined;
		function Counter() {
			const model = useModel(() => new CountModel());
			disposeSpy = vi.spyOn(model, Symbol.dispose);
			return <div>{model.count}</div>;
		}

		render(<Counter />);
		expect(disposeSpy).not.toHaveBeenCalled();

		await act(() => root.unmount());
		expect(disposeSpy).toHaveBeenCalledTimes(1);
	});

	it("ignores changing the factory function between renders", async () => {
		const CountModel = createModel(() => ({
			count: signal(0),
			increment() {
				this.count.value++;
			},
		}));

		let modelInstances: any[] = [];
		let useAlternateFactory = false;

		function Counter() {
			const factory = useAlternateFactory ? () => new CountModel() : CountModel;
			const model = useModel(factory);
			modelInstances.push(model);
			return (
				<button onClick={() => model.increment()}>{model.count.value}</button>
			);
		}

		render(<Counter />);
		const button = scratch.querySelector("button")!;

		expect(button.textContent).toBe("0");
		expect(modelInstances.length).toBe(1);

		await act(() => {
			useAlternateFactory = true;
			button.click();
		});

		expect(button.textContent).toBe("1");
		expect(modelInstances.length).toBe(2);
		expect(modelInstances[0]).toBe(modelInstances[1]);
	});

	describe("Typescript Types", () => {
		it("fail when using useModel with incompatible model constructor", () => {
			function SimpleClass() {
				// @ts-expect-error Should be a ModelConstructor
				expect(() => useModel(class {})).toThrow();
				return null;
			}

			function SimpleFunction() {
				// @ts-expect-error Factory should return a Model Constructor
				useModel(() => ({}));
				return null;
			}

			const ModelWithArgs = createModel((arg: number) => ({
				value: signal(arg),
			}));

			function WithArgs() {
				// @ts-expect-error useModel cannot instantiate a model constructor with arguments
				useModel(ModelWithArgs);
				// Correct usage is to wrap in a factory function
				useModel(() => new ModelWithArgs(0));
				return null;
			}

			render(
				<>
					<SimpleClass />
					<SimpleFunction />
					<WithArgs />
				</>
			);
		});
	});
});
