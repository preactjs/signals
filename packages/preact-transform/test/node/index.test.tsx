import { describe, it, expect } from "vitest";
import { transform } from "@babel/core";
import prettier from "prettier";
import signalsTransform, { PluginOptions } from "../../src/index";

const format = (code: string) => prettier.format(code, { parser: "babel" });

function transformCode(
	code: string,
	options?: PluginOptions,
	filename?: string,
	cjs?: boolean
) {
	const signalsPluginConfig: any[] = [signalsTransform];
	if (options) {
		signalsPluginConfig.push(options);
	}

	const result = transform(code, {
		filename,
		plugins: [signalsPluginConfig, "@babel/plugin-syntax-jsx"],
		sourceType: cjs ? "script" : undefined,
	});

	return result?.code || "";
}

async function runTest(
	input: string,
	expected: string,
	options: PluginOptions = { enabled: true },
	filename?: string,
	cjs?: boolean
) {
	const output = transformCode(input, options, filename, cjs);
	expect(await format(output)).to.equal(await format(expected));
}

describe("Preact Signals Babel Transform", () => {
	describe("signal naming", () => {
		const DEBUG_OPTIONS = { enabled: true };

		const runDebugTest = async (
			inputCode: string,
			expectedOutput: string,
			fileName: string
		) => {
			await runTest(inputCode, expectedOutput, DEBUG_OPTIONS, fileName);
		};

		it("injects names for signal calls", async () => {
			const inputCode = `
				function MyComponent() {
					const count = signal(0);
					const double = computed(() => count.value * 2);
					return <div>{double.value}</div>;
				}
			`;

			const expectedOutput = `
				function MyComponent() {
					const count = signal(0, {
						name: "count (Component.js:3)",
					});
					const double = computed(() => count.value * 2, {
						name: "double (Component.js:4)",
					});
					return <div>{double.value}</div>;
				}
			`;

			await runDebugTest(inputCode, expectedOutput, "Component.js");
		});

		it("injects names for useSignal calls", async () => {
			const inputCode = `
				function MyComponent() {
					const count = useSignal(0);
					const message = useSignal("hello");
					return <div>{count.value} {message.value}</div>;
				}
			`;

			const expectedOutput = `
				function MyComponent() {
					const count = useSignal(0, {
						name: "count (Component.js:3)",
					});
					const message = useSignal("hello", {
						name: "message (Component.js:4)",
					});
					return <div>{count.value} {message.value}</div>;
				}
			`;

			await runDebugTest(inputCode, expectedOutput, "Component.js");
		});

		it("doesn't inject names when already provided", async () => {
			const inputCode = `
				function MyComponent() {
					const count = signal(0, { name: "myCounter" });
					const data = useSignal(null, { name: "userData", watched: () => {} });
					return <div>{count.value}</div>;
				}
			`;

			const expectedOutput = `
				function MyComponent() {
					const count = signal(0, {
						name: "myCounter",
					});
					const data = useSignal(null, {
						name: "userData",
						watched: () => {},
					});
					return <div>{count.value}</div>;
				}
			`;

			await runDebugTest(inputCode, expectedOutput, "Component.js");
		});

		it("handles signals with no initial value", async () => {
			const inputCode = `
				function MyComponent() {
					const count = useSignal();
					return <div>{count.value}</div>;
				}
			`;

			const expectedOutput = `
				function MyComponent() {
					const count = useSignal(undefined, {
						name: "count (Component.js:3)",
					});
					return <div>{count.value}</div>;
				}
			`;

			await runDebugTest(inputCode, expectedOutput, "Component.js");
		});

		it("injects names for action calls", async () => {
			const inputCode = `
				const increment = action(() => count.value++);
			`;
			const expectedOutput = `
				const increment = action(() => count.value++, {
					name: "increment (Component.js:2)",
				});
			`;
			await runDebugTest(inputCode, expectedOutput, "Component.js");
		});

		it("injects names for createModel calls", async () => {
			const inputCode = `
				const CounterModel = createModel(() => ({
					count: signal(0),
				}));
			`;
			const expectedOutput = `
				const CounterModel = createModel(() => ({
					count: signal(0, {
						name: "count (Component.js:3)",
					}),
				}), {
					name: "CounterModel (Component.js:2)",
				});
			`;
			await runDebugTest(inputCode, expectedOutput, "Component.js");
		});

		it("doesn't inject names for action when already provided", async () => {
			const inputCode = `
				const increment = action(() => count.value++, { name: "customIncrement" });
			`;
			const expectedOutput = `
				const increment = action(() => count.value++, {
					name: "customIncrement",
				});
			`;
			await runDebugTest(inputCode, expectedOutput, "Component.js");
		});

		it("doesn't inject names for createModel when already provided", async () => {
			const inputCode = `
				const CounterModel = createModel(() => ({
					count: signal(0),
				}), { name: "MyCounter" });
			`;
			const expectedOutput = `
				const CounterModel = createModel(() => ({
					count: signal(0, {
						name: "count (Component.js:3)",
					}),
				}), {
					name: "MyCounter",
				});
			`;
			await runDebugTest(inputCode, expectedOutput, "Component.js");
		});

		it("merges name into existing action options", async () => {
			const inputCode = `
				const increment = action(() => count.value++, { someOption: true });
			`;
			const expectedOutput = `
				const increment = action(() => count.value++, {
					someOption: true,
					name: "increment (Component.js:2)",
				});
			`;
			await runDebugTest(inputCode, expectedOutput, "Component.js");
		});
	});
});
