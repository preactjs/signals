import { transform } from "@swc/core";
import { fileURLToPath } from "node:url";
import prettier from "prettier";
import { describe, expect, it } from "vitest";

const format = (code: string) => prettier.format(code, { parser: "babel" });
const pluginPath = fileURLToPath(
	// @ts-expect-error URL types are not fully supported in Node.js yet
	new URL("../../dist/signals_react_transform_swc.wasm", import.meta.url)
);

interface PluginOptions {
	mode?: "auto" | "manual" | "all";
	importSource?: string;
	detectTransformedJSX?: boolean;
	experimental?: {
		debug?: boolean;
		noTryFinally?: boolean;
	};
}

async function transformCode(
	code: string,
	options: PluginOptions = { mode: "auto" },
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
				plugins: [[pluginPath, options]],
			},
		},
	});

	return result.code;
}

async function expectTransform(
	input: string,
	expected: string,
	options: PluginOptions = { mode: "auto" },
	filename?: string,
	cjs?: boolean
) {
	const output = await transformCode(input, options, filename, cjs);
	expect(await format(output)).to.equal(await format(expected));
}

describe("React Signals SWC Transform", () => {
	it("auto mode transforms components that use JSX and signals", async () => {
		await expectTransform(
			`
				function MyComponent() {
					return <div>{signal.value}</div>;
				}
			`,
			`
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				function MyComponent() {
					var _effect = _useSignals(1);
					try {
						return <div>{signal.value}</div>;
					} finally {
						_effect.f();
					}
				}
			`
		);
	});

	it("auto mode leaves components without JSX alone", async () => {
		await expectTransform(
			`
				function MyComponent() {
					return signal.value;
				}
			`,
			`
				function MyComponent() {
					return signal.value;
				}
			`
		);
	});

	it("auto mode transforms custom hooks that use signals", async () => {
		await expectTransform(
			`
				function useCustomHook() {
					return signal.value;
				}
			`,
			`
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				function useCustomHook() {
					var _effect = _useSignals(2);
					try {
						return signal.value;
					} finally {
						_effect.f();
					}
				}
			`
		);
	});

	it("detects destructuring patterns with value properties", async () => {
		await expectTransform(
			`
				function MyComponent(props) {
					const { value: signalValue } = props.signal;
					return <div>{signalValue}</div>;
				}
			`,
			`
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				function MyComponent(props) {
					var _effect = _useSignals(1);
					try {
						const { value: signalValue } = props.signal;
						return <div>{signalValue}</div>;
					} finally {
						_effect.f();
					}
				}
			`
		);
	});

	it("does not leak signal tracking from useEffect callbacks", async () => {
		await expectTransform(
			`
				function MyComponent() {
					useEffect(() => {
						signal.value;
					}, []);
					return <div>Hello</div>;
				}
			`,
			`
				function MyComponent() {
					useEffect(() => {
						signal.value;
					}, []);
					return <div>Hello</div>;
				}
			`
		);
	});

	it("manual mode only transforms opted-in functions", async () => {
		await expectTransform(
			`
				/* @useSignals */
				function renderCount() {
					return signal.value;
				}
			`,
			`
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				/* @useSignals */ function renderCount() {
					var _effect = _useSignals(1);
					try {
						return signal.value;
					} finally {
						_effect.f();
					}
				}
			`,
			{ mode: "manual" }
		);
	});

	it("opt-out comments override opt-in comments", async () => {
		await expectTransform(
			`
				/**
				 * @noUseSignals
				 * @useSignals
				 */
				function MyComponent() {
					return <div>{signal.value}</div>;
				}
			`,
			`
				/**
				 * @noUseSignals
				 * @useSignals
				 */ function MyComponent() {
					return <div>{signal.value}</div>;
				}
			`
		);
	});

	it("all mode transforms JSX components even without signals", async () => {
		await expectTransform(
			`
				function MyComponent() {
					return <div>Hello World</div>;
				}
			`,
			`
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				function MyComponent() {
					var _effect = _useSignals(1);
					try {
						return <div>Hello World</div>;
					} finally {
						_effect.f();
					}
				}
			`,
			{ mode: "all" }
		);
	});

	it("supports the noTryFinally option", async () => {
		await expectTransform(
			`
				const MyComponent = () => {
					return <div>{signal.value}</div>;
				};
			`,
			`
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				const MyComponent = () => {
					_useSignals();
					return <div>{signal.value}</div>;
				};
			`,
			{ experimental: { noTryFinally: true } }
		);
	});

	it("supports custom import sources", async () => {
		await expectTransform(
			`
				function MyComponent() {
					return <div>{signal.value}</div>;
				}
			`,
			`
				import { useSignals as _useSignals } from "custom-source";
				function MyComponent() {
					var _effect = _useSignals(1);
					try {
						return <div>{signal.value}</div>;
					} finally {
						_effect.f();
					}
				}
			`,
			{ importSource: "custom-source" }
		);
	});

	it("adds debug names to components and signal declarations", async () => {
		await expectTransform(
			`
				function MyComponent() {
					const count = signal(0);
					const doubled = computed(() => count.value * 2);
					return <div>{doubled.value}</div>;
				}
			`,
			`
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				function MyComponent() {
					var _effect = _useSignals(1, "MyComponent");
					try {
						const count = signal(0, {
							name: "count (Component.js:3)",
						});
						const doubled = computed(() => count.value * 2, {
							name: "doubled (Component.js:4)",
						});
						return <div>{doubled.value}</div>;
					} finally {
						_effect.f();
					}
				}
			`,
			{ experimental: { debug: true } },
			"Component.js"
		);
	});

	it("keeps existing debug names intact", async () => {
		await expectTransform(
			`
				function MyComponent() {
					const count = signal(0, { name: "counter" });
					return <div>{count.value}</div>;
				}
			`,
			`
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				function MyComponent() {
					var _effect = _useSignals(1, "MyComponent");
					try {
						const count = signal(0, {
							name: "counter",
						});
						return <div>{count.value}</div>;
					} finally {
						_effect.f();
					}
				}
			`,
			{ experimental: { debug: true } },
			"Component.js"
		);
	});

	it("handles zero-argument signal helpers in debug mode", async () => {
		await expectTransform(
			`
				function MyComponent() {
					const count = useSignal();
					return <div>{count.value}</div>;
				}
			`,
			`
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				function MyComponent() {
					var _effect = _useSignals(1, "MyComponent");
					try {
						const count = useSignal(undefined, {
							name: "count (Component.js:3)",
						});
						return <div>{count.value}</div>;
					} finally {
						_effect.f();
					}
				}
			`,
			{ experimental: { debug: true } },
			"Component.js"
		);
	});

	it("detects react/jsx-runtime calls when configured", async () => {
		await expectTransform(
			`
				import { jsx as _jsx } from "react/jsx-runtime";
				function MyComponent() {
					signal.value;
					return _jsx("div", { children: "Hello World" });
				}
			`,
			`
				import { jsx as _jsx } from "react/jsx-runtime";
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				function MyComponent() {
					var _effect = _useSignals(1);
					try {
						signal.value;
						return _jsx("div", {
							children: "Hello World",
						});
					} finally {
						_effect.f();
					}
				}
			`,
			{ detectTransformedJSX: true }
		);
	});

	it("detects React.createElement calls when configured", async () => {
		await expectTransform(
			`
				import React from "react";
				function MyComponent() {
					signal.value;
					return React.createElement("div", null, "Hello World");
				}
			`,
			`
				import React from "react";
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				function MyComponent() {
					var _effect = _useSignals(1);
					try {
						signal.value;
						return React.createElement("div", null, "Hello World");
					} finally {
						_effect.f();
					}
				}
			`,
			{ detectTransformedJSX: true }
		);
	});

	it("transforms anonymous default-exported function expressions", async () => {
		await expectTransform(
			`
				export default (function () {
					return <div>{signal.value}</div>;
				});
			`,
			`
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				export default function () {
					var _effect = _useSignals(1);
					try {
						return <div>{signal.value}</div>;
					} finally {
						_effect.f();
					}
				}
			`,
			{ mode: "auto" },
			"Component.js"
		);
	});

	it("supports CommonJS inputs", async () => {
		await expectTransform(
			`
				const React = require("react");
				function MyComponent() {
					return <div>{signal.value}</div>;
				}
			`,
			`
				var _useSignals = require("@preact/signals-react/runtime").useSignals;
				const React = require("react");
				function MyComponent() {
					var _effect = _useSignals(1);
					try {
						return <div>{signal.value}</div>;
					} finally {
						_effect.f();
					}
				}
			`,
			{ mode: "auto" },
			undefined,
			true
		);
	});
});
