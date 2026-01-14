import { createModel, signal, useModel } from "@preact/signals";
import { createElement, render, Fragment } from "preact";
import { act } from "preact/test-utils";
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

	beforeEach(() => {
		scratch = document.createElement("div");
	});

	afterEach(() => {
		render(null, scratch);
	});

	it("creates model instance using model constructor", () => {
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

		render(<Counter />, scratch);
		const button = scratch.querySelector("button")!;

		expect(button.textContent).toBe("0");

		act(() => button.click());

		expect(button.textContent).toBe("1");
	});

	it("creates model instance using wrapper around model constructor", () => {
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

		render(<Counter />, scratch);
		const button = scratch.querySelector("button")!;

		expect(button.textContent).toBe("0");

		act(() => button.click());

		expect(button.textContent).toBe("1");
	});

	it("creates model instance using wrapper around model constructor with arguments", () => {
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

		render(<Counter />, scratch);
		const button = scratch.querySelector("button")!;

		expect(button.textContent).toBe("5");

		act(() => button.click());

		expect(button.textContent).toBe("6");
	});

	it("returns the same instance across multiple renders", () => {
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

		render(<Counter />, scratch);
		const button = scratch.querySelector("button")!;

		expect(button.textContent).toBe("0");
		expect(modelInstances.length).toBe(1);

		act(() => button.click());

		expect(button.textContent).toBe("1");
		expect(modelInstances.length).toBe(2);
		expect(modelInstances[0]).toBe(modelInstances[1]);
	});

	it("diposes the model on unmount", () => {
		const CountModel = createModel(() => ({ count: signal(0) }));

		let disposeSpy: MockInstance | undefined;
		function Counter() {
			const model = useModel(CountModel);
			disposeSpy = vi.spyOn(model, Symbol.dispose);
			return <div>{model.count}</div>;
		}

		act(() => render(<Counter />, scratch));
		expect(disposeSpy).not.toHaveBeenCalled();

		act(() => render(null, scratch));
		expect(disposeSpy).toHaveBeenCalledTimes(1);
	});

	it("disposes the model on unmount when created via a factory function", () => {
		const CountModel = createModel(() => ({ count: signal(0) }));

		let disposeSpy: MockInstance | undefined;
		function Counter() {
			const model = useModel(() => new CountModel());
			disposeSpy = vi.spyOn(model, Symbol.dispose);
			return <div>{model.count}</div>;
		}

		act(() => render(<Counter />, scratch));
		expect(disposeSpy).not.toHaveBeenCalled();

		act(() => render(null, scratch));
		expect(disposeSpy).toHaveBeenCalledTimes(1);
	});

	it("ignores changing the factory function between renders", () => {
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

		render(<Counter />, scratch);
		const button = scratch.querySelector("button")!;

		expect(button.textContent).toBe("0");
		expect(modelInstances.length).toBe(1);

		act(() => {
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
				</>,
				scratch
			);
		});
	});
});
