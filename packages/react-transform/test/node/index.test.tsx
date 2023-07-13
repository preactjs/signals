import { transform } from "@babel/core";
import signalsTransform, { PluginOptions } from "../../src/index";

function dedent(str: string) {
	let result = str;

	const lines = str.split("\n");
	let minIndent: number = Number.MAX_SAFE_INTEGER;
	lines.forEach(function (l) {
		const m = l.match(/^(\s+)\S+/);
		if (m) {
			const indent = m[1].length;
			if (!minIndent) {
				// this is the first indented line
				minIndent = indent;
			} else {
				minIndent = Math.min(minIndent, indent);
			}
		}
	});

	if (minIndent !== null) {
		result = lines
			.map(function (l) {
				return l[0] === " " || l[0] === "\t" ? l.slice(minIndent) : l;
			})
			.join("\n");
	}

	return result.trim();
}

const toSpaces = (str: string) => str.replace(/\t/g, "  ");

function transformCode(code: string, options?: PluginOptions) {
	const signalsPluginConfig: any[] = [signalsTransform];
	if (options) {
		signalsPluginConfig.push(options);
	}

	const result = transform(code, {
		plugins: [signalsPluginConfig, "@babel/plugin-syntax-jsx"],
	});

	return result?.code || "";
}

function runTest(
	input: string,
	expected: string,
	options: PluginOptions = { mode: "auto" }
) {
	const output = transformCode(input, options);
	expect(toSpaces(output)).to.equal(toSpaces(dedent(expected)));
}

describe("React Signals Babel Transform", () => {
	describe("auto mode transformations", () => {
		it("wraps arrow function component with return statement in try/finally", () => {
			const inputCode = `
				const MyComponent = () => {
					signal.value;
					return <div>Hello World</div>;
				};
			`;

			const expectedOutput = `
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				const MyComponent = () => {
					var _stopTracking = _useSignals();
					try {
						signal.value;
						return <div>Hello World</div>;
					} finally {
						_stopTracking();
					}
				};
			`;

			runTest(inputCode, expectedOutput);
		});

		it("wraps arrow function component with inline return in try/finally", () => {
			const inputCode = `
				const MyComponent = () => <div>{name.value}</div>;
			`;

			const expectedOutput = `
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				const MyComponent = () => {
					var _stopTracking = _useSignals();
					try {
						return <div>{name.value}</div>;
					} finally {
						_stopTracking();
					}
				};
			`;

			runTest(inputCode, expectedOutput);
		});

		it("wraps function declaration components with try/finally", () => {
			const inputCode = `
				function MyComponent() {
					signal.value;
					return <div>Hello World</div>;
				}
			`;

			const expectedOutput = `
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				function MyComponent() {
					var _stopTracking = _useSignals();
					try {
						signal.value;
						return <div>Hello World</div>;
					} finally {
						_stopTracking();
					}
				}
			`;

			runTest(inputCode, expectedOutput);
		});

		it("wraps component function expressions with try/finally", () => {
			const inputCode = `
				const MyComponent = function () {
					signal.value;
					return <div>Hello World</div>;
				}
			`;

			const expectedOutput = `
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				const MyComponent = function () {
					var _stopTracking = _useSignals();
					try {
						signal.value;
						return <div>Hello World</div>;
					} finally {
						_stopTracking();
					}
				};
			`;

			runTest(inputCode, expectedOutput);
		});

		it("transforms custom hook arrow functions with return statement", () => {
			const inputCode = `
				const useCustomHook = () => {
					return signal.value;
				};
			`;

			const expectedOutput = `
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				const useCustomHook = () => {
					_useSignals();
					return signal.value;
				};
			`;

			runTest(inputCode, expectedOutput);
		});

		it("transforms custom hook arrow functions with inline return statement", () => {
			const inputCode = `
				const useCustomHook = () => name.value;
			`;

			const expectedOutput = `
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				const useCustomHook = () => {
					_useSignals();
					return name.value;
				};
			`;

			runTest(inputCode, expectedOutput);
		});

		it("transforms custom hook function declarations", () => {
			const inputCode = `
				function useCustomHook() {
					return signal.value;
				}
			`;

			const expectedOutput = `
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				function useCustomHook() {
					_useSignals();
					return signal.value;
				}
			`;

			runTest(inputCode, expectedOutput);
		});

		it("transforms custom hook function expressions", () => {
			const inputCode = `
				const useCustomHook = function () {
					return signal.value;
				}
			`;

			const expectedOutput = `
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				const useCustomHook = function () {
					_useSignals();
					return signal.value;
				};
			`;

			runTest(inputCode, expectedOutput);
		});
	});

	describe("manual mode opt-in transformations", () => {
		it("transforms arrow function component with leading opt-in JSDoc comment before variable declaration", () => {
			const inputCode = `
				/** @trackSignals */
				const MyComponent = () => {
					return <div>Hello World</div>;
				};
			`;

			const expectedOutput = `
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				/** @trackSignals */
				const MyComponent = () => {
					var _stopTracking = _useSignals();
					try {
						return <div>Hello World</div>;
					} finally {
						_stopTracking();
					}
				};
			`;

			runTest(inputCode, expectedOutput, { mode: "manual" });
		});

		it("transforms arrow function component with leading opt-in JSDoc comment before arrow function", () => {
			const inputCode = `
				const MyComponent = /** @trackSignals */() => {
					return <div>Hello World</div>;
				};
			`;

			const expectedOutput = `
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				const MyComponent = /** @trackSignals */() => {
					var _stopTracking = _useSignals();
					try {
						return <div>Hello World</div>;
					} finally {
						_stopTracking();
					}
				};
			`;

			runTest(inputCode, expectedOutput, { mode: "manual" });
		});

		it("transforms component function declarations with leading opt-in JSDoc comment", () => {
			const inputCode = `
				/** @trackSignals */
				function MyComponent() {
					return <div>Hello World</div>;
				}
			`;

			const expectedOutput = `
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				/** @trackSignals */
				function MyComponent() {
					var _stopTracking = _useSignals();
					try {
						return <div>Hello World</div>;
					} finally {
						_stopTracking();
					}
				}
			`;

			runTest(inputCode, expectedOutput, { mode: "manual" });
		});

		it("transforms default exported function declaration components with leading opt-in JSDoc comment", () => {
			const inputCode = `
				/** @trackSignals */
				export default function MyComponent() {
					return <div>Hello World</div>;
				}
			`;

			const expectedOutput = `
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				/** @trackSignals */
				export default function MyComponent() {
					var _stopTracking = _useSignals();
					try {
						return <div>Hello World</div>;
					} finally {
						_stopTracking();
					}
				}
			`;

			runTest(inputCode, expectedOutput, { mode: "manual" });
		});

		it("transforms default exported arrow function expression component with leading opt-in JSDoc comment", () => {
			const inputCode = `
				/** @trackSignals */
				export default () => {
					return <div>Hello World</div>;
				}
			`;

			const expectedOutput = `
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				/** @trackSignals */
				export default (() => {
					var _stopTracking = _useSignals();
					try {
						return <div>Hello World</div>;
					} finally {
						_stopTracking();
					}
				});
			`;

			runTest(inputCode, expectedOutput, { mode: "manual" });
		});

		it("transforms named exported function declaration components with leading opt-in JSDoc comment", () => {
			const inputCode = `
				/** @trackSignals */
				export function MyComponent() {
					return <div>Hello World</div>;
				}
			`;

			const expectedOutput = `
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				/** @trackSignals */
				export function MyComponent() {
					var _stopTracking = _useSignals();
					try {
						return <div>Hello World</div>;
					} finally {
						_stopTracking();
					}
				}
			`;

			runTest(inputCode, expectedOutput, { mode: "manual" });
		});

		it("transforms named exported variable declaration components (arrow functions) with leading opt-in JSDoc comment", () => {
			const inputCode = `
				/** @trackSignals */
				export const MyComponent = () => {
					return <div>Hello World</div>;
				};
			`;

			const expectedOutput = `
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				/** @trackSignals */
				export const MyComponent = () => {
					var _stopTracking = _useSignals();
					try {
						return <div>Hello World</div>;
					} finally {
						_stopTracking();
					}
				};
			`;

			runTest(inputCode, expectedOutput, { mode: "manual" });
		});

		it("transforms named exported variable declaration components (function expression) with leading opt-in JSDoc comment", () => {
			const inputCode = `
				/** @trackSignals */
				export const MyComponent = function () {
					return <div>Hello World</div>;
				};
			`;

			const expectedOutput = `
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				/** @trackSignals */
				export const MyComponent = function () {
					var _stopTracking = _useSignals();
					try {
						return <div>Hello World</div>;
					} finally {
						_stopTracking();
					}
				};
			`;

			runTest(inputCode, expectedOutput, { mode: "manual" });
		});

		it("transforms arrow function custom hook with leading opt-in JSDoc comment before variable declaration", () => {
			const inputCode = `
				/** @trackSignals */
				const useCustomHook = () => {
					return useState(0);
				};
			`;

			const expectedOutput = `
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				/** @trackSignals */
				const useCustomHook = () => {
					_useSignals();
					return useState(0);
				};
			`;

			runTest(inputCode, expectedOutput, { mode: "manual" });
		});

		it("transforms default exported function declaration custom hooks with leading opt-in JSDoc comment", () => {
			const inputCode = `
				/** @trackSignals */
				export default function useCustomHook() {
					return useState(0);
				}
			`;

			const expectedOutput = `
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				/** @trackSignals */
				export default function useCustomHook() {
					_useSignals();
					return useState(0);
				}
			`;

			runTest(inputCode, expectedOutput, { mode: "manual" });
		});

		it("transforms name exported function declaration custom hooks with leading opt-in JSDoc comment", () => {
			const inputCode = `
				/** @trackSignals */
				export function useCustomHook() {
					return useState(0);
				}
			`;

			const expectedOutput = `
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				/** @trackSignals */
				export function useCustomHook() {
					_useSignals();
					return useState(0);
				}
			`;

			runTest(inputCode, expectedOutput, { mode: "manual" });
		});
	});

	describe("auto mode opt-out transformations", () => {
		it("opt-out comment overrides opt-in comment", () => {
			const inputCode = `
				/**
				 * @noTrackSignals
				 * @trackSignals
				 */
				const MyComponent = () => {
					return <div>{signal.value}</div>;
				};
			`;

			const expectedOutput = inputCode;

			runTest(inputCode, expectedOutput, { mode: "auto" });
		});

		it("skips transforming arrow function component with leading opt-out JSDoc comment before variable declaration", () => {
			const inputCode = `
				/** @noTrackSignals */
				const MyComponent = () => {
					return <div>{signal.value}</div>;
				};
			`;

			const expectedOutput = inputCode;

			runTest(inputCode, expectedOutput, { mode: "auto" });
		});

		it("skips transforming arrow function component with leading opt-out JSDoc comment before arrow function", () => {
			const inputCode = `
				const MyComponent = /** @noTrackSignals */() => {
					return <div>{signal.value}</div>;
				};
			`;

			const expectedOutput = inputCode;

			runTest(inputCode, expectedOutput, {
				mode: "auto",
			});
		});

		it("skips transforming function declaration components with leading opt-out JSDoc comment", () => {
			const inputCode = `
				/** @noTrackSignals */
				function MyComponent() {
					return <div>{signal.value}</div>;
				}
			`;

			const expectedOutput = inputCode;

			runTest(inputCode, expectedOutput, { mode: "auto" });
		});

		it("skips transforming default exported function declaration components with leading opt-out JSDoc comment", () => {
			const inputCode = `
				/** @noTrackSignals */
				export default function MyComponent() {
					return <div>{signal.value}</div>;
				}
			`;

			const expectedOutput = inputCode;

			runTest(inputCode, expectedOutput, { mode: "auto" });
		});

		it("skips transforming default exported arrow function expression components with leading opt-out JSDoc comment", () => {
			const inputCode = `
				/** @noTrackSignals */
				export default (() => {
					return <div>{signal.value}</div>;
				});
			`;

			const expectedOutput = inputCode;

			runTest(inputCode, expectedOutput, { mode: "auto" });
		});

		it("skips transforming named exported function declaration components with leading opt-out JSDoc comment", () => {
			const inputCode = `
				/** @noTrackSignals */
				export function MyComponent() {
					return <div>{signal.value}</div>;
				}
			`;

			const expectedOutput = inputCode;

			runTest(inputCode, expectedOutput, { mode: "auto" });
		});

		it("skips transforming named exported variable declaration components (arrow functions) with leading opt-out JSDoc comment", () => {
			const inputCode = `
				/** @noTrackSignals */
				export const MyComponent = () => {
					return <div>{signal.value}</div>;
				};
			`;

			const expectedOutput = inputCode;

			runTest(inputCode, expectedOutput, { mode: "auto" });
		});

		it("skips transforming named exported variable declaration components (function expression) with leading opt-out JSDoc comment", () => {
			const inputCode = `
				/** @noTrackSignals */
				export const MyComponent = function () {
					return <div>{signal.value}</div>;
				};
			`;

			const expectedOutput = inputCode;

			runTest(inputCode, expectedOutput, { mode: "auto" });
		});

		it("skips transforming arrow function custom hook with leading opt-out JSDoc comment before variable declaration", () => {
			const inputCode = `
				/** @noTrackSignals */
				const useCustomHook = () => {
					return useState(0);
				};
			`;

			const expectedOutput = inputCode;

			runTest(inputCode, expectedOutput, { mode: "auto" });
		});

		it("skips transforming default exported function declaration custom hooks with leading opt-out JSDoc comment", () => {
			const inputCode = `
				/** @noTrackSignals */
				export default function useCustomHook() {
					return useState(0);
				}
			`;

			const expectedOutput = inputCode;

			runTest(inputCode, expectedOutput, { mode: "auto" });
		});

		it("skips transforming name exported function declaration custom hooks with leading opt-out JSDoc comment", () => {
			const inputCode = `
				/** @noTrackSignals */
				export function useCustomHook() {
					return useState(0);
				}
			`;

			const expectedOutput = inputCode;

			runTest(inputCode, expectedOutput, { mode: "auto" });
		});
	});

	describe("auto mode no transformations", () => {
		it("does not transform arrow function component that does not use signals", () => {
			const inputCode = `
				const MyComponent = () => {
					return <div>Hello World</div>;
				};
			`;

			const expectedOutput = inputCode;
			runTest(inputCode, expectedOutput);
		});

		it("does not transform arrow function component with inline return that does not use signals", () => {
			const inputCode = `
				const MyComponent = () => <div>Hello World!</div>;
			`;

			const expectedOutput = inputCode;
			runTest(inputCode, expectedOutput);
		});

		it("does not transform function declaration components that don't use signals", () => {
			const inputCode = `
				function MyComponent() {
					return <div>Hello World</div>;
				}
			`;

			const expectedOutput = inputCode;
			runTest(inputCode, expectedOutput);
		});

		it("does not transform function expression components that don't use signals", () => {
			const inputCode = `
				const MyComponent = function () {
					return <div>Hello World</div>;
				};
			`;

			const expectedOutput = inputCode;
			runTest(inputCode, expectedOutput);
		});

		it("does not transform custom hook function declarations that don't use signals", () => {
			const inputCode = `
				function useCustomHook() {
					return useState(0);
				}
			`;

			const expectedOutput = inputCode;
			runTest(inputCode, expectedOutput);
		});

		it("does not transform incorrectly named custom hook function declarations", () => {
			const inputCode = `
				function usecustomHook() {
					return signal.value;
				}
			`;

			const expectedOutput = inputCode;
			runTest(inputCode, expectedOutput);
		});
	});

	describe("noTryFinally option", () => {
		it("prepends arrow function component with useSignals call", () => {
			const inputCode = `
				const MyComponent = () => {
					signal.value;
					return <div>Hello World</div>;
				};
			`;

			const expectedOutput = `
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				const MyComponent = () => {
					_useSignals();
					signal.value;
					return <div>Hello World</div>;
				};
			`;

			runTest(inputCode, expectedOutput, {
				experimental: { noTryFinally: true },
			});
		});

		it("prepends arrow function component with useSignals call", () => {
			const inputCode = `
				const MyComponent = () => <div>{name.value}</div>;
			`;

			const expectedOutput = `
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				const MyComponent = () => {
					_useSignals();
					return <div>{name.value}</div>;
				};
			`;

			runTest(inputCode, expectedOutput, {
				experimental: { noTryFinally: true },
			});
		});

		it("prepends function declaration components with useSignals call", () => {
			const inputCode = `
				function MyComponent() {
					signal.value;
					return <div>Hello World</div>;
				}
			`;

			const expectedOutput = `
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				function MyComponent() {
					_useSignals();
					signal.value;
					return <div>Hello World</div>;
				}
			`;

			runTest(inputCode, expectedOutput, {
				experimental: { noTryFinally: true },
			});
		});

		it("prepends function expression components with useSignals call", () => {
			const inputCode = `
				const MyComponent = function () {
					signal.value;
					return <div>Hello World</div>;
				}
			`;

			const expectedOutput = `
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				const MyComponent = function () {
					_useSignals();
					signal.value;
					return <div>Hello World</div>;
				};
			`;

			runTest(inputCode, expectedOutput, {
				experimental: { noTryFinally: true },
			});
		});

		it("prepends custom hook function declarations with useSignals call", () => {
			const inputCode = `
				function useCustomHook() {
					signal.value;
					return useState(0);
				}
			`;

			const expectedOutput = `
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				function useCustomHook() {
					_useSignals();
					signal.value;
					return useState(0);
				}
			`;

			runTest(inputCode, expectedOutput, {
				experimental: { noTryFinally: true },
			});
		});
	});
});
