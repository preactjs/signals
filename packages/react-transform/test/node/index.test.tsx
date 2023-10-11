import { transform, traverse } from "@babel/core";
import type { Visitor } from "@babel/core";
import type { Scope } from "@babel/traverse";
import prettier from "prettier";
import signalsTransform, { PluginOptions } from "../../src/index";
import {
	CommentKind,
	GeneratedCode,
	assignmentComp,
	objAssignComp,
	declarationComp,
	declarationHooks,
	exportDefaultComp,
	exportDefaultHooks,
	exportNamedComp,
	exportNamedHooks,
	objectPropertyComp,
	variableComp,
	objMethodComp,
	variableHooks,
} from "./helpers";

// To help interactively debug a specific test case, add the test ids of the
// test cases you want to debug to the `debugTestIds` array, e.g. (["258",
// "259"]). Set to true to debug all tests.
const DEBUG_TEST_IDS: string[] | true = [];

const format = (code: string) => prettier.format(code, { parser: "babel" });

function transformCode(
	code: string,
	options?: PluginOptions,
	filename?: string
) {
	const signalsPluginConfig: any[] = [signalsTransform];
	if (options) {
		signalsPluginConfig.push(options);
	}

	const result = transform(code, {
		filename,
		plugins: [signalsPluginConfig, "@babel/plugin-syntax-jsx"],
	});

	return result?.code || "";
}

function runTest(
	input: string,
	expected: string,
	options: PluginOptions = { mode: "auto" },
	filename?: string
) {
	const output = transformCode(input, options, filename);
	console.log("\t", format(input).replace(/\s+/g, " "));
	console.log("\t", format(output).replace(/\s+/g, " "));
	expect(format(output)).to.equal(format(expected));
}

interface TestCaseConfig {
	/** Whether to use components whose body contains valid code auto mode would transform (true) or not (false) */
	useValidAutoMode: boolean;
	/** Whether to assert that the plugin transforms the code (true) or not (false) */
	expectTransformed: boolean;
	/** What kind of opt-in or opt-out to include if any */
	comment?: CommentKind;
	/** Options to pass to the babel plugin */
	options: PluginOptions;
	/** The filename to run the transform under */
	filename?: string;
}

let testCount = 0;
const getTestId = () => (testCount++).toString().padStart(3, "0");

function runTestCases(config: TestCaseConfig, testCases: GeneratedCode[]) {
	testCases = testCases
		.map(t => ({
			...t,
			input: format(t.input),
			transformed: format(t.transformed),
		}))
		.sort((a, b) => (a.name < b.name ? -1 : 1));

	for (const testCase of testCases) {
		let testId = getTestId();

		// Only run tests in debugTestIds
		if (
			Array.isArray(DEBUG_TEST_IDS) &&
			DEBUG_TEST_IDS.length > 0 &&
			!DEBUG_TEST_IDS.includes(testId)
		) {
			continue;
		}

		it(`(${testId}) ${testCase.name}`, () => {
			if (DEBUG_TEST_IDS === true || DEBUG_TEST_IDS.includes(testId)) {
				console.log("input :", testCase.input.replace(/\s+/g, " ")); // eslint-disable-line no-console
				debugger; // eslint-disable-line no-debugger
			}

			const input = testCase.input;
			let expected = "";
			if (config.expectTransformed) {
				expected +=
					'import { useSignals as _useSignals } from "@preact/signals-react/runtime";\n';
				expected += testCase.transformed;
			} else {
				expected = input;
			}

			runTest(input, expected, config.options, config.filename);
		});
	}
}

function runGeneratedComponentTestCases(config: TestCaseConfig): void {
	const codeConfig = { auto: config.useValidAutoMode, comment: config.comment };
	config = {
		...config,
		filename: config.useValidAutoMode
			? "/path/to/Component.js"
			: "C:\\path\\to\\lowercase.js",
	};

	// e.g. function C() {}
	describe("function components", () => {
		runTestCases(config, declarationComp(codeConfig));
	});

	// e.g. const C = () => {};
	describe("variable declared components", () => {
		runTestCases(config, variableComp(codeConfig));
	});

	if (config.comment !== undefined) {
		// e.g. const C = () => {};
		describe("variable declared components (inline comment)", () => {
			runTestCases(
				config,
				variableComp({
					...codeConfig,
					comment: undefined,
					inlineComment: config.comment,
				})
			);
		});
	}

	describe("object method components", () => {
		runTestCases(config, objMethodComp(codeConfig));
	});

	// e.g. C = () => {};
	describe("assigned to variable components", () => {
		runTestCases(config, assignmentComp(codeConfig));
	});

	// e.g. obj.C = () => {};
	describe("assigned to object property components", () => {
		runTestCases(config, objAssignComp(codeConfig));
	});

	// e.g. const obj = { C: () => {} };
	describe("object property components", () => {
		runTestCases(config, objectPropertyComp(codeConfig));
	});

	// e.g. export default () => {};
	describe(`default exported components`, () => {
		runTestCases(config, exportDefaultComp(codeConfig));
	});

	// e.g. export function C() {}
	describe("named exported components", () => {
		runTestCases(config, exportNamedComp(codeConfig));
	});
}

function runGeneratedHookTestCases(config: TestCaseConfig): void {
	const codeConfig = { auto: config.useValidAutoMode, comment: config.comment };
	config = {
		...config,
		filename: config.useValidAutoMode
			? "/path/to/useCustomHook.js"
			: "C:\\path\\to\\usecustomHook.js",
	};

	// e.g. function useCustomHook() {}
	describe.only("function hooks", () => {
		runTestCases(config, declarationHooks(codeConfig));
	});

	// e.g. const useCustomHook = () => {}
	describe.only("variable declared hooks", () => {
		runTestCases(config, variableHooks(codeConfig));
	});

	// e.g. export default () => {}
	describe.only("default exported hooks", () => {
		runTestCases(config, exportDefaultHooks(codeConfig));
	});

	// e.g. export function useCustomHook() {}
	describe.only("named exported hooks", () => {
		runTestCases(config, exportNamedHooks(codeConfig));
	});
}

function runGeneratedTestCases(config: TestCaseConfig): void {
	runGeneratedComponentTestCases(config);
	runGeneratedHookTestCases(config);
}

describe("React Signals Babel Transform", () => {
	describe("auto mode transforms", () => {
		runGeneratedTestCases({
			useValidAutoMode: true,
			expectTransformed: true,
			options: { mode: "auto" },
		});
	});

	describe("auto mode doesn't transform", () => {
		it("useEffect callbacks that use signals", () => {
			const inputCode = `
				function App() {
					useEffect(() => {
						signal.value = <span>Hi</span>;
					}, []);
					return <div>Hello World</div>;
				}
			`;

			const expectedOutput = inputCode;
			runTest(inputCode, expectedOutput);
		});

		runGeneratedTestCases({
			useValidAutoMode: false,
			expectTransformed: false,
			options: { mode: "auto" },
		});
	});

	describe("auto mode supports opting out of transforming", () => {
		it("opt-out comment overrides opt-in comment", () => {
			const inputCode = `
				/**
				 * @noTrackSignals
				 * @trackSignals
				 */
				function MyComponent() {
					return <div>{signal.value}</div>;
				};
			`;

			const expectedOutput = inputCode;

			runTest(inputCode, expectedOutput, { mode: "auto" });
		});

		runGeneratedTestCases({
			useValidAutoMode: true,
			expectTransformed: false,
			comment: "opt-out",
			options: { mode: "auto" },
		});
	});

	describe("auto mode supports opting into transformation", () => {
		runGeneratedTestCases({
			useValidAutoMode: false,
			expectTransformed: true,
			comment: "opt-in",
			options: { mode: "auto" },
		});
	});

	describe("manual mode doesn't transform anything by default", () => {
		it("useEffect callbacks that use signals", () => {
			const inputCode = `
				function App() {
					useEffect(() => {
						signal.value = <span>Hi</span>;
					}, []);
					return <div>Hello World</div>;
				}
			`;

			const expectedOutput = inputCode;
			runTest(inputCode, expectedOutput);
		});

		runGeneratedTestCases({
			useValidAutoMode: true,
			expectTransformed: false,
			options: { mode: "manual" },
		});
	});

	describe("manual mode opts into transforming", () => {
		it("opt-out comment overrides opt-in comment", () => {
			const inputCode = `
				/**
				 * @noTrackSignals
				 * @trackSignals
				 */
				function MyComponent() {
					return <div>{signal.value}</div>;
				};
			`;

			const expectedOutput = inputCode;

			runTest(inputCode, expectedOutput, { mode: "auto" });
		});

		runGeneratedTestCases({
			useValidAutoMode: true,
			expectTransformed: true,
			comment: "opt-in",
			options: { mode: "manual" },
		});
	});
});

// TODO: migrate hook tests

describe("React Signals Babel Transform", () => {
	describe("auto mode transformations", () => {
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
		it("transforms custom hook arrow function with leading opt-in JSDoc comment before variable declaration", () => {
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

		it("transforms custom hook exported as default function declaration with leading opt-in JSDoc comment", () => {
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

		it("transforms custom hooks exported as named function declaration with leading opt-in JSDoc comment", () => {
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
		it("skips transforming custom hook arrow function with leading opt-out JSDoc comment before variable declaration", () => {
			const inputCode = `
				/** @noTrackSignals */
				const useCustomHook = () => {
					return useState(0);
				};
			`;

			const expectedOutput = inputCode;

			runTest(inputCode, expectedOutput, { mode: "auto" });
		});

		it("skips transforming custom hooks exported as default function declaration with leading opt-out JSDoc comment", () => {
			const inputCode = `
				/** @noTrackSignals */
				export default function useCustomHook() {
					return useState(0);
				}
			`;

			const expectedOutput = inputCode;

			runTest(inputCode, expectedOutput, { mode: "auto" });
		});

		it("skips transforming custom hooks exported as named function declaration with leading opt-out JSDoc comment", () => {
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
		it("skips transforming custom hook function declarations that don't use signals", () => {
			const inputCode = `
				function useCustomHook() {
					return useState(0);
				}
			`;

			const expectedOutput = inputCode;
			runTest(inputCode, expectedOutput);
		});

		it("skips transforming custom hook function declarations incorrectly named", () => {
			const inputCode = `
				function usecustomHook() {
					return signal.value;
				}
			`;

			const expectedOutput = inputCode;
			runTest(inputCode, expectedOutput);
		});
	});

	// TODO: Figure out what to do with the following

	describe("all mode transformations", () => {
		it("skips transforming arrow function component with leading opt-out JSDoc comment before variable declaration", () => {
			const inputCode = `
				/** @noTrackSignals */
				const MyComponent = () => {
					return <div>{signal.value}</div>;
				};
			`;

			const expectedOutput = inputCode;

			runTest(inputCode, expectedOutput, { mode: "all" });
		});

		it("skips transforming function declaration components with leading opt-out JSDoc comment", () => {
			const inputCode = `
				/** @noTrackSignals */
				function MyComponent() {
					return <div>{signal.value}</div>;
				}
			`;

			const expectedOutput = inputCode;

			runTest(inputCode, expectedOutput, { mode: "all" });
		});

		it("transforms function declaration component that doesn't use signals", () => {
			const inputCode = `
				function MyComponent() {
					return <div>Hello World</div>;
				}
			`;

			const expectedOutput = `
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				function MyComponent() {
					var _effect = _useSignals();
					try {
						return <div>Hello World</div>;
					} finally {
						_effect.f();
					}
				}
			`;

			runTest(inputCode, expectedOutput, { mode: "all" });
		});

		it("transforms arrow function component with return statement that doesn't use signals", () => {
			const inputCode = `
				const MyComponent = () => {
					return <div>Hello World</div>;
				};
			`;

			const expectedOutput = `
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				const MyComponent = () => {
					var _effect = _useSignals();
					try {
						return <div>Hello World</div>;
					} finally {
						_effect.f();
					}
				};
			`;

			runTest(inputCode, expectedOutput, { mode: "all" });
		});

		it("transforms function declaration component that uses signals", () => {
			const inputCode = `
				function MyComponent() {
					signal.value;
					return <div>Hello World</div>;
				}
			`;

			const expectedOutput = `
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				function MyComponent() {
					var _effect = _useSignals();
					try {
						signal.value;
						return <div>Hello World</div>;
					} finally {
						_effect.f();
					}
				}
			`;

			runTest(inputCode, expectedOutput, { mode: "all" });
		});

		it("transforms arrow function component with return statement that uses signals", () => {
			const inputCode = `
				const MyComponent = () => {
					signal.value;
					return <div>Hello World</div>;
				};
			`;

			const expectedOutput = `
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				const MyComponent = () => {
					var _effect = _useSignals();
					try {
						signal.value;
						return <div>Hello World</div>;
					} finally {
						_effect.f();
					}
				};
			`;

			runTest(inputCode, expectedOutput, { mode: "all" });
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

	describe("importSource option", () => {
		it("imports useSignals from custom source", () => {
			const inputCode = `
				const MyComponent = () => {
					signal.value;
					return <div>Hello World</div>;
				};
			`;

			const expectedOutput = `
				import { useSignals as _useSignals } from "custom-source";
				const MyComponent = () => {
					var _effect = _useSignals();
					try {
						signal.value;
						return <div>Hello World</div>;
					} finally {
						_effect.f();
					}
				};
			`;

			runTest(inputCode, expectedOutput, { importSource: "custom-source" });
		});
	});

	describe("scope tracking", () => {
		interface VisitorState {
			programScope?: Scope;
		}

		const programScopeVisitor: Visitor<VisitorState> = {
			Program: {
				exit(path, state) {
					state.programScope = path.scope;
				},
			},
		};

		function getRootScope(code: string) {
			const signalsPluginConfig: any[] = [signalsTransform];
			const result = transform(code, {
				ast: true,
				plugins: [signalsPluginConfig, "@babel/plugin-syntax-jsx"],
			});
			if (!result) {
				throw new Error("Could not transform code");
			}

			const state: VisitorState = {};
			traverse(result.ast, programScopeVisitor, undefined, state);

			const scope = state.programScope;
			if (!scope) {
				throw new Error("Could not find program scope");
			}

			return scope;
		}

		it("adds newly inserted import declarations and usages to program scope", () => {
			const scope = getRootScope(`
				const MyComponent = () => {
					signal.value;
					return <div>Hello World</div>;
				};
			`);

			const signalsBinding = scope.bindings["_useSignals"];
			expect(signalsBinding).to.exist;
			expect(signalsBinding.kind).to.equal("module");
			expect(signalsBinding.referenced).to.be.true;
		});
	});
});
