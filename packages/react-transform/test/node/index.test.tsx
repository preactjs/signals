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

describe("React Signals Babel Transform - auto success", () => {
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

	it("wraps function declarations with try/finally", () => {
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

	it("wraps function expressions with try/finally", () => {
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
});

describe("React Signals Babel Transform - manual opt-in transform", () => {
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

	it("transforms function declarations with leading opt-in JSDoc comment", () => {
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

	it("transforms default exported function declarations with leading opt-in JSDoc comment", () => {
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

	it("transforms default exported arrow function expression with leading opt-in JSDoc comment", () => {
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

	it("transforms named exported function declarations with leading opt-in JSDoc comment", () => {
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

	it("transforms named exported variable declarations (arrow functions) with leading opt-in JSDoc comment", () => {
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

	it("transforms named exported variable declarations (function expression) with leading opt-in JSDoc comment", () => {
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
});

describe("React Signals Babel Transform - auto opt-out transform", () => {
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

	it("skips transforming function declarations with leading opt-out JSDoc comment", () => {
		const inputCode = `
			/** @noTrackSignals */
			function MyComponent() {
				return <div>Hello World</div>;
			}
		`;

		const expectedOutput = inputCode;

		runTest(inputCode, expectedOutput, { mode: "auto" });
	});

	it("skips transforming default exported function declarations with leading opt-out JSDoc comment", () => {
		const inputCode = `
			/** @noTrackSignals */
			export default function MyComponent() {
				return <div>Hello World</div>;
			}
		`;

		const expectedOutput = inputCode;

		runTest(inputCode, expectedOutput, { mode: "auto" });
	});

	it("skips transforming default exported arrow function expression with leading opt-out JSDoc comment", () => {
		const inputCode = `
			/** @noTrackSignals */
			export default (() => {
				return <div>Hello World</div>;
			});
		`;

		const expectedOutput = inputCode;

		runTest(inputCode, expectedOutput, { mode: "auto" });
	});

	it("skips transforming named exported function declarations with leading opt-out JSDoc comment", () => {
		const inputCode = `
			/** @noTrackSignals */
			export function MyComponent() {
				return <div>Hello World</div>;
			}
		`;

		const expectedOutput = inputCode;

		runTest(inputCode, expectedOutput, { mode: "auto" });
	});

	it("wraps named exported variable declarations (arrow functions) with leading JSDoc comment", () => {
		const inputCode = `
			/** @noTrackSignals */
			export const MyComponent = () => {
				return <div>Hello World</div>;
			};
		`;

		const expectedOutput = inputCode;

		runTest(inputCode, expectedOutput, { mode: "auto" });
	});

	it("wraps named exported variable declarations (function expression) with leading JSDoc comment", () => {
		const inputCode = `
			/** @noTrackSignals */
			export const MyComponent = function () {
				return <div>Hello World</div>;
			};
		`;

		const expectedOutput = inputCode;

		runTest(inputCode, expectedOutput, { mode: "auto" });
	});

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
});

describe("React Signals Babel Transform - no auto transform", () => {
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

	it("does not transform function declarations that don't use signals", () => {
		const inputCode = `
			function MyComponent() {
				return <div>Hello World</div>;
			}
		`;

		const expectedOutput = inputCode;
		runTest(inputCode, expectedOutput);
	});

	it("does not transform function expressions that don't use signals", () => {
		const inputCode = `
			const MyComponent = function () {
				return <div>Hello World</div>;
			};
		`;

		const expectedOutput = inputCode;
		runTest(inputCode, expectedOutput);
	});
});
