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
					const total = computed(() => 1, { ["name"]: "total" });
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
					const total = computed(() => 1, {
						["name"]: "total",
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

		it("derives names from surrounding syntax", () => {
			const inputCode = [
				"class Store {",
				"  count = signal(0);",
				"  #selected = signal(false);",
				"  constructor() {",
				'    this.status = signal("idle");',
				'    this["message"] = computed(() => "");',
				"  }",
				"  load() {",
				"    return computed(() => this.status.value);",
				"  }",
				"}",
				"const model = {",
				"  enabled: signal(true),",
				'  "label": computed(() => "label"),',
				'  0: signal("zero"),',
				"};",
				"function createVisible() {",
				"  return signal(true);",
				"}",
				"consume(signal(false));",
				"const createSelected = () => signal(true);",
				"const rows = values.map(() => signal(0));",
				'const key = "dynamic";',
				"const dynamic = {[key]: computed(() => key)};",
				"const options = getOptions();",
				"const preserved = signal(0, options);",
				"const spread = signal(0, {...options});",
				"[first] = [signal(0)];",
			].join("\n");

			const output = transformCode(inputCode, DEBUG_OPTIONS, "Models.js");

			for (const expectedName of [
				"count (Models.js:2)",
				"#selected (Models.js:3)",
				"status (Models.js:5)",
				"message (Models.js:6)",
				"load (Models.js:9)",
				"enabled (Models.js:13)",
				"label (Models.js:14)",
				"0 (Models.js:15)",
				"createVisible (Models.js:18)",
				"signal (Models.js:20)",
				"createSelected (Models.js:21)",
				"signal (Models.js:22)",
				"computed (Models.js:24)",
				"signal (Models.js:28)",
			]) {
				expect(output).toContain(`name: "${expectedName}"`);
			}
			expect(output).toContain("const preserved = signal(0, options);");
			expect(output).not.toContain("preserved (Models.js:26)");
			expect(output).not.toContain("spread (Models.js:27)");
		});
	});
});
