import { describe, it, expect } from "vitest";
import { transform } from "@swc/core";
import prettier from "prettier";
import { fileURLToPath } from "node:url";

const format = (code: string) => prettier.format(code, { parser: "babel" });
const pluginPath = fileURLToPath(
	// @ts-expect-error URL types are not fully supported in Node.js yet
	new URL("../../dist/signals_preact_transform_swc.wasm", import.meta.url)
);

interface PluginOptions {
	enabled?: boolean;
}

async function transformCode(
	code: string,
	options?: PluginOptions,
	filename?: string,
	cjs?: boolean
) {
	const isTypeScript = /\.[cm]?tsx?$/.test(filename ?? "");
	const result = await transform(code, {
		filename,
		isModule: cjs ? false : undefined,
		jsc: {
			target: "es2022",
			parser: isTypeScript
				? {
						syntax: "typescript",
						tsx: true,
					}
				: {
						syntax: "ecmascript",
						jsx: true,
					},
			transform: {
				react: {
					runtime: "preserve",
				},
			},
			experimental: {
				plugins: [[pluginPath, options ?? { enabled: true }]],
			},
		},
	});

	return result.code;
}

async function runTest(
	input: string,
	expected: string,
	options: PluginOptions = { enabled: true },
	filename?: string,
	cjs?: boolean
) {
	const output = await transformCode(input, options, filename, cjs);
	expect(await format(output)).to.equal(await format(expected));
}

describe("Preact Signals SWC Transform", () => {
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
	});
});
