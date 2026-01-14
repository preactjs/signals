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
import { it, describe, expect } from "vitest";

// Guidance for Debugging Generated Tests
// ===============================
//
// To help interactively debug a specific test case, add the test ids of the
// test cases you want to debug to the `debugTestIds` array, e.g. (["258",
// "259"]). Set to true to debug all tests. Set to false to skip all generated tests.
//
// The `debugger` statement in `runTestCases` will then trigger for the test case
// specified in the DEBUG_TEST_IDS. Follow the guide at https://vitest.dev/guide/debugging for
// instructions on debugging Vitest tests in your environment.
const DEBUG_TEST_IDS: string[] | boolean = false;

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
	options: PluginOptions = { mode: "auto" },
	filename?: string,
	cjs?: boolean
) {
	const output = transformCode(input, options, filename, cjs);
	expect(await format(output)).to.equal(await format(expected));
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
	testCases = testCases.sort((a, b) => (a.name < b.name ? -1 : 1));

	for (const testCase of testCases) {
		let testId = getTestId();

		// Only run tests in debugTestIds
		if (
			DEBUG_TEST_IDS === false ||
			(Array.isArray(DEBUG_TEST_IDS) &&
				DEBUG_TEST_IDS.length > 0 &&
				!DEBUG_TEST_IDS.includes(testId))
		) {
			continue;
		}

		it(`(${testId}) ${testCase.name}`, async () => {
			if (DEBUG_TEST_IDS === true || DEBUG_TEST_IDS.includes(testId)) {
				console.log("input:", testCase.input.replace(/\s+/g, " ")); // eslint-disable-line no-console
				debugger; // eslint-disable-line no-debugger
			}

			const input = await format(testCase.input);
			const transformed = await format(testCase.transformed);

			let expected = "";
			if (config.expectTransformed) {
				expected +=
					'import { useSignals as _useSignals } from "@preact/signals-react/runtime";\n';
				expected += transformed;
			} else {
				expected = input;
			}

			await runTest(input, expected, config.options, config.filename);
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
	describe("function hooks", () => {
		runTestCases(config, declarationHooks(codeConfig));
	});

	// e.g. const useCustomHook = () => {}
	describe("variable declared hooks", () => {
		runTestCases(config, variableHooks(codeConfig));
	});

	// e.g. export default () => {}
	describe("default exported hooks", () => {
		runTestCases(config, exportDefaultHooks(codeConfig));
	});

	// e.g. export function useCustomHook() {}
	describe("named exported hooks", () => {
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

		it("detects destructuring patterns with value property", async () => {
			const inputCode = `
				function MyComponent(props) {
					const { value: signalValue } = props.signal;
					return <div>{signalValue}</div>;
				}
			`;

			const expectedOutput = `
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
			`;

			await runTest(inputCode, expectedOutput);
		});

		it("detects nested destructuring patterns with value property", async () => {
			// Test case 1: Simple nested destructuring
			const inputCode1 = `
				function MyComponent(props) {
					const { signal: { value } } = props;
					return <div>{value}</div>;
				}
			`;

			const expectedOutput1 = `
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				function MyComponent(props) {
					var _effect = _useSignals(1);
					try {
						const { signal: { value } } = props;
						return <div>{value}</div>;
					} finally {
						_effect.f();
					}
				}
			`;

			await runTest(inputCode1, expectedOutput1);

			// Test case 2: Deeply nested destructuring
			const inputCode2 = `
				function MyComponent(props) {
					const { data: { signal: { value: signalValue } } } = props;
					return <div>{signalValue}</div>;
				}
			`;

			const expectedOutput2 = `
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				function MyComponent(props) {
					var _effect = _useSignals(1);
					try {
						const { data: { signal: { value: signalValue } } } = props;
						return <div>{signalValue}</div>;
					} finally {
						_effect.f();
					}
				}
			`;

			await runTest(inputCode2, expectedOutput2);

			// Test case 3: Multiple value properties at different levels
			const inputCode3 = `
				function MyComponent(props) {
					const { value: outerValue, signal: { value: innerValue } } = props;
					return <div>{outerValue} {innerValue}</div>;
				}
			`;

			const expectedOutput3 = `
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				function MyComponent(props) {
					var _effect = _useSignals(1);
					try {
						const { value: outerValue, signal: { value: innerValue } } = props;
						return <div>{outerValue} {innerValue}</div>;
					} finally {
						_effect.f();
					}
				}
			`;

			await runTest(inputCode3, expectedOutput3);
		});

		it("signal access in nested functions", async () => {
			const inputCode = `
				function MyComponent(props) {
					return props.listSignal.value.map(function iteration(x) {
						return <div>{x}</div>;
					});
				};
			`;

			const expectedOutput = `
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				function MyComponent(props) {
					var _effect = _useSignals(1);
					try {
						return props.listSignal.value.map(function iteration(x) {
							return <div>{x}</div>;
						});
					} finally {
						_effect.f();
					}
				}
			`;

			await runTest(inputCode, expectedOutput);
		});
	});

	describe("auto mode doesn't transform", () => {
		it.only("should not leak JSX detection outside of component scope", async () => {
			const inputCode = `
				function wrapper() {
					function Component() {
						return <div>Hello</div>;
					}
					const CountModel = createModel(() => ({
						count: signal(0),
						increment() {
							this.count.value++;
						},
					}));
				}
			`;

			const expectedOutput = inputCode;

			await runTest(inputCode, expectedOutput);
		});

		it.only("should not leak JSX detection outside of non-components", async () => {
			const inputCode = `
				describe("suite", () => {
					it("test1", () => {
						render(<Counter />);
					});
					it("test2", () => {
						const CountModel = () => signal.value;
						function Counter() {
							return <div>Hello2</div>
						}
						render(<Counter />);
					});
				});
			`;

			const expectedOutput = inputCode;

			await runTest(inputCode, expectedOutput);
		});

		it.only("createModel factories that use signals", async () => {
			// const inputCode = `
			// 	describe("useModel", () => {
			// 		let scratch;
			// 		let root;
			// 		async function render(element) {
			// 			await act(() => {
			// 				root.render(element);
			// 			});
			// 			return scratch.innerHTML;
			// 		}
			// 		beforeEach(async () => {
			// 			scratch = document.createElement("div");
			// 			document.body.appendChild(scratch);
			// 			getConsoleErrorSpy().mockClear();
			// 			root = await createRoot(scratch);
			// 		});
			// 		afterEach(async () => {
			// 			scratch.remove();
			// 			checkConsoleErrorLogs();
			// 		});
			// 		it("creates model instance using model constructor", async () => {
			// 			const CountModel = createModel(() => ({
			// 				count: signal(0),
			// 				increment() {
			// 					this.count.value++;
			// 				},
			// 			}));
			// 			function Counter() {
			// 				const model = useModel(CountModel);
			// 				return <button onClick={() => model.increment()}>{model.count}</button>;
			// 			}
			// 			await render(<Counter />);
			// 			const button = scratch.querySelector("button");
			// 			expect(button.textContent).toBe("0");
			// 			await act(() => button.click());
			// 			expect(button.textContent).toBe("1");
			// 		});
			// 		it("creates model instance using wrapper around model constructor", async () => {
			// 			const CountModel = createModel(() => ({
			// 				count: signal(0),
			// 				increment() {
			// 					this.count.value++;
			// 				},
			// 			}));
			// 			function Counter() {
			// 				const model = useModel(() => new CountModel());
			// 				return <button onClick={() => model.increment()}>{model.count}</button>;
			// 			}
			// 			await render(<Counter />);
			// 			const button = scratch.querySelector("button");
			// 			expect(button.textContent).toBe("0");
			// 			await act(() => button.click());
			// 			expect(button.textContent).toBe("1");
			// 		});
			// 	});
			// `;

			const inputCode = `
				describe("suite", () => {
					it("test1", async () => {
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
						render(<Counter />);
					});
					it("test2", async () => {
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
						render(<Counter />);
					});
				});
			`;

			const expectedOutput = inputCode;
			await runTest(inputCode, expectedOutput);
		});

		it("useEffect callbacks that use signals", async () => {
			const inputCode = `
				function App() {
					useEffect(() => {
						signal.value = <span>Hi</span>;
					}, []);
					return <div>Hello World</div>;
				}
			`;

			const expectedOutput = inputCode;
			await runTest(inputCode, expectedOutput);
		});

		runGeneratedTestCases({
			useValidAutoMode: false,
			expectTransformed: false,
			options: { mode: "auto" },
		});
	});

	describe("auto mode supports opting out of transforming", () => {
		it("opt-out comment overrides opt-in comment", async () => {
			const inputCode = `
				/**
				 * @noUseSignals
				 * @useSignals
				 */
				function MyComponent() {
					return <div>{signal.value}</div>;
				};
			`;

			const expectedOutput = inputCode;

			await runTest(inputCode, expectedOutput, { mode: "auto" });
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
		it("useEffect callbacks that use signals", async () => {
			const inputCode = `
				function App() {
					useEffect(() => {
						signal.value = <span>Hi</span>;
					}, []);
					return <div>Hello World</div>;
				}
			`;

			const expectedOutput = inputCode;
			await runTest(inputCode, expectedOutput);
		});

		runGeneratedTestCases({
			useValidAutoMode: true,
			expectTransformed: false,
			options: { mode: "manual" },
		});
	});

	describe("manual mode opts into transforming", () => {
		it("opt-out comment overrides opt-in comment", async () => {
			const inputCode = `
				/**
				 * @noUseSignals
				 * @useSignals
				 */
				function MyComponent() {
					return <div>{signal.value}</div>;
				};
			`;

			const expectedOutput = inputCode;

			await runTest(inputCode, expectedOutput, { mode: "auto" });
		});

		runGeneratedTestCases({
			useValidAutoMode: true,
			expectTransformed: true,
			comment: "opt-in",
			options: { mode: "manual" },
		});
	});
});

describe("React Signals Babel Transform", () => {
	// TODO: Figure out what to do with the following

	describe("all mode transformations", () => {
		it("should not leak", () => {
			// TODO
		});

		it("skips transforming arrow function component with leading opt-out JSDoc comment before variable declaration", async () => {
			const inputCode = `
				/** @noUseSignals */
				const MyComponent = () => {
					return <div>{signal.value}</div>;
				};
			`;

			const expectedOutput = inputCode;

			await runTest(inputCode, expectedOutput, { mode: "all" });
		});

		it("skips transforming function declaration components with leading opt-out JSDoc comment", async () => {
			const inputCode = `
				/** @noUseSignals */
				function MyComponent() {
					return <div>{signal.value}</div>;
				}
			`;

			const expectedOutput = inputCode;

			await runTest(inputCode, expectedOutput, { mode: "all" });
		});

		it("transforms function declaration component that doesn't use signals", async () => {
			const inputCode = `
				function MyComponent() {
					return <div>Hello World</div>;
				}
			`;

			const expectedOutput = `
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				function MyComponent() {
					var _effect = _useSignals(1);
					try {
						return <div>Hello World</div>;
					} finally {
						_effect.f();
					}
				}
			`;

			await runTest(inputCode, expectedOutput, { mode: "all" });
		});

		it("transforms require syntax", async () => {
			const inputCode = `
			    const react = require("react");
				function MyComponent() {
					return <div>Hello World</div>;
				}
			`;

			const expectedOutput = `
				var _useSignals = require("@preact/signals-react/runtime").useSignals
				const react = require("react");
				function MyComponent() {
					var _effect = _useSignals(1);
					try {
						return <div>Hello World</div>;
					} finally {
						_effect.f();
					}
				}
			`;
			await runTest(
				inputCode,
				expectedOutput,
				{ mode: "all" },
				undefined,
				true
			);
		});

		it("transforms arrow function component with return statement that doesn't use signals", async () => {
			const inputCode = `
				const MyComponent = () => {
					return <div>Hello World</div>;
				};
			`;

			const expectedOutput = `
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				const MyComponent = () => {
					var _effect = _useSignals(1);
					try {
						return <div>Hello World</div>;
					} finally {
						_effect.f();
					}
				};
			`;

			await runTest(inputCode, expectedOutput, { mode: "all" });
		});

		it("transforms function declaration component that uses signals", async () => {
			const inputCode = `
				function MyComponent() {
					signal.value;
					return <div>Hello World</div>;
				}
			`;

			const expectedOutput = `
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				function MyComponent() {
					var _effect = _useSignals(1);
					try {
						signal.value;
						return <div>Hello World</div>;
					} finally {
						_effect.f();
					}
				}
			`;

			await runTest(inputCode, expectedOutput, { mode: "all" });
		});

		it("transforms arrow function component with return statement that uses signals", async () => {
			const inputCode = `
				const MyComponent = () => {
					signal.value;
					return <div>Hello World</div>;
				};
			`;

			const expectedOutput = `
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				const MyComponent = () => {
					var _effect = _useSignals(1);
					try {
						signal.value;
						return <div>Hello World</div>;
					} finally {
						_effect.f();
					}
				};
			`;

			await runTest(inputCode, expectedOutput, { mode: "all" });
		});
	});

	describe("noTryFinally option", () => {
		it("prepends arrow function component with useSignals call", async () => {
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

			await runTest(inputCode, expectedOutput, {
				experimental: { noTryFinally: true },
			});
		});

		it("prepends arrow function component with useSignals call", async () => {
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

			await runTest(inputCode, expectedOutput, {
				experimental: { noTryFinally: true },
			});
		});

		it("prepends function declaration components with useSignals call", async () => {
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

			await runTest(inputCode, expectedOutput, {
				experimental: { noTryFinally: true },
			});
		});

		it("prepends function expression components with useSignals call", async () => {
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

			await runTest(inputCode, expectedOutput, {
				experimental: { noTryFinally: true },
			});
		});

		it("prepends custom hook function declarations with useSignals call", async () => {
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

			await runTest(inputCode, expectedOutput, {
				experimental: { noTryFinally: true },
			});
		});

		it("recursively propogates `.value` reads to parent component", async () => {
			const inputCode = `
				function MyComponent() {
					return <div>{new Array(20).fill(null).map(() => signal.value)}</div>;
				}
			`;

			const expectedOutput = `
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				function MyComponent() {
					_useSignals();
					return <div>{new Array(20).fill(null).map(() => signal.value)}</div>;
				}
			`;

			await runTest(inputCode, expectedOutput, {
				experimental: { noTryFinally: true },
			});
		});
	});

	describe("importSource option", () => {
		it("imports useSignals from custom source", async () => {
			const inputCode = `
				const MyComponent = () => {
					signal.value;
					return <div>Hello World</div>;
				};
			`;

			const expectedOutput = `
				import { useSignals as _useSignals } from "custom-source";
				const MyComponent = () => {
					var _effect = _useSignals(1);
					try {
						signal.value;
						return <div>Hello World</div>;
					} finally {
						_effect.f();
					}
				};
			`;

			await runTest(inputCode, expectedOutput, {
				importSource: "custom-source",
			});
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
			traverse(result.ast!, programScopeVisitor, undefined, state);

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

			scope.path.scope.crawl();
			const signalsBinding = scope.bindings["_useSignals"];
			expect(signalsBinding).to.exist;
			expect(signalsBinding.kind).to.equal("module");
			expect(signalsBinding.referenced).to.be.true;
		});
	});

	describe("signal naming", () => {
		const DEBUG_OPTIONS = { mode: "auto", experimental: { debug: true } };

		const runDebugTest = async (
			inputCode: string,
			expectedOutput: string,
			fileName: string
		) => {
			// @ts-expect-error
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
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				function MyComponent() {
					var _effect = _useSignals(1, "MyComponent");
					try {
						const count = signal(0, {
							name: "count (Component.js:3)",
						});
						const double = computed(() => count.value * 2, {
							name: "double (Component.js:4)",
						});
						return <div>{double.value}</div>;
					} finally {
						_effect.f();
					}
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
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				function MyComponent() {
					var _effect = _useSignals(1, "MyComponent");
					try {
						const count = useSignal(0, {
							name: "count (Component.js:3)",
						});
						const message = useSignal("hello", {
							name: "message (Component.js:4)",
						});
						return <div>{count.value} {message.value}</div>;
					} finally {
						_effect.f();
					}
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
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				function MyComponent() {
					var _effect = _useSignals(1, "MyComponent");
					try {
						const count = signal(0, {
							name: "myCounter",
						});
						const data = useSignal(null, {
							name: "userData",
							watched: () => {},
						});
						return <div>{count.value}</div>;
					} finally {
						_effect.f();
					}
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
			`;

			await runDebugTest(inputCode, expectedOutput, "Component.js");
		});
	});

	describe("detectTransformedJSX option", () => {
		it("detects elements created using react/jsx-runtime import", async () => {
			const inputCode = `
				import { jsx as _jsx } from "react/jsx-runtime";
				function MyComponent() {
					signal.value;
					return _jsx("div", { children: "Hello World" });
				};
			`;

			const expectedOutput = `
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
			`;

			await runTest(inputCode, expectedOutput, {
				detectTransformedJSX: true,
			});
		});

		it("detects elements created using react/jsx-runtime cjs require", async () => {
			const inputCode = `
				const jsxRuntime = require("react/jsx-runtime");
				function MyComponent() {
					signal.value;
					return jsxRuntime.jsx("div", { children: "Hello World" });
				};
			`;

			const expectedOutput = `
				var _useSignals = require("@preact/signals-react/runtime").useSignals
				const jsxRuntime = require("react/jsx-runtime");
				function MyComponent() {
					var _effect = _useSignals(1);
					try {
						signal.value;
						return jsxRuntime.jsx("div", {
							children: "Hello World",
						});
					} finally {
						_effect.f();
					}
				}
			`;

			await runTest(
				inputCode,
				expectedOutput,
				{
					detectTransformedJSX: true,
				},
				undefined,
				true
			);
		});

		it("detects elements created using react/jsx-runtime cjs destuctured import", async () => {
			const inputCode = `
				const { jsx } = require("react/jsx-runtime");
				function MyComponent() {
					signal.value;
					return jsx("div", { children: "Hello World" });
				};
			`;

			const expectedOutput = `
				var _useSignals = require("@preact/signals-react/runtime").useSignals
				const { jsx } = require("react/jsx-runtime");
				function MyComponent() {
					var _effect = _useSignals(1);
					try {
						signal.value;
						return jsx("div", {
							children: "Hello World",
						});
					} finally {
						_effect.f();
					}
				}
			`;

			await runTest(
				inputCode,
				expectedOutput,
				{
					detectTransformedJSX: true,
				},
				undefined,
				true
			);
		});

		it("does not detect jsx-runtime calls when detectJSXAlternatives is disabled", async () => {
			const inputCode = `
				import { jsx as _jsx } from "react/jsx-runtime";
				function MyComponent() {
					signal.value;
					return _jsx("div", { children: "Hello World" });
				};
			`;

			// Should not transform because jsx-runtime detection is disabled - no useSignals import should be added
			const expectedOutput = `
				import { jsx as _jsx } from "react/jsx-runtime";
				function MyComponent() {
					signal.value;
					return _jsx("div", {
						children: "Hello World",
					});
				}
			`;

			await runTest(inputCode, expectedOutput, {
				detectTransformedJSX: false,
			});
		});

		it("detects createElement calls created using react import", async () => {
			const inputCode = `
				import { createElement } from "react";
				function MyComponent() {
					signal.value;
					return createElement("div", { children: "Hello World" });
				};
			`;

			const expectedOutput = `
				import { createElement } from "react";
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				function MyComponent() {
					var _effect = _useSignals(1);
					try {
						signal.value;
						return createElement("div", {
							children: "Hello World",
						});
					} finally {
						_effect.f();
					}
				}
			`;

			await runTest(inputCode, expectedOutput, {
				detectTransformedJSX: true,
			});
		});

		it("detects createElement calls created using react default import", async () => {
			const inputCode = `
				import React from "react";
				function MyComponent() {
					signal.value;
					return React.createElement("div", { children: "Hello World" });
				};
			`;

			const expectedOutput = `
				import React from "react";
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				function MyComponent() {
					var _effect = _useSignals(1);
					try {
						signal.value;
						return React.createElement("div", {
							children: "Hello World",
						});
					} finally {
						_effect.f();
					}
				}
			`;

			await runTest(inputCode, expectedOutput, {
				detectTransformedJSX: true,
			});
		});

		it("detects createElement calls created using react cjs require", async () => {
			const inputCode = `
				const React = require("react");
				function MyComponent() {
					signal.value;
					return React.createElement("div", { children: "Hello World" });
				};
			`;

			const expectedOutput = `
				var _useSignals = require("@preact/signals-react/runtime").useSignals
				const React = require("react");
				function MyComponent() {
					var _effect = _useSignals(1);
					try {
						signal.value;
						return React.createElement("div", {
							children: "Hello World",
						});
					} finally {
						_effect.f();
					}
				}
			`;

			await runTest(
				inputCode,
				expectedOutput,
				{
					detectTransformedJSX: true,
				},
				undefined,
				true
			);
		});

		it("detects createElement calls created using destructured react cjs require", async () => {
			const inputCode = `
				const { createElement } = require("react");
				function MyComponent() {
					signal.value;
					return createElement("div", { children: "Hello World" });
				};
			`;

			const expectedOutput = `
				var _useSignals = require("@preact/signals-react/runtime").useSignals
				const { createElement } = require("react");
				function MyComponent() {
					var _effect = _useSignals(1);
					try {
						signal.value;
						return createElement("div", {
							children: "Hello World",
						});
					} finally {
						_effect.f();
					}
				}
			`;

			await runTest(
				inputCode,
				expectedOutput,
				{
					detectTransformedJSX: true,
				},
				undefined,
				true
			);
		});

		it("detects signal access in nested functions", async () => {
			const inputCode = `
				import { jsx } from "react/jsx-runtime";
				function MyComponent(props) {
					return props.listSignal.value.map(function iteration(x) {
						return jsx("div", { children: x });
					});
				};
			`;

			const expectedOutput = `
				import { jsx } from "react/jsx-runtime";
				import { useSignals as _useSignals } from "@preact/signals-react/runtime";
				function MyComponent(props) {
					var _effect = _useSignals(1);
					try {
						return props.listSignal.value.map(function iteration(x) {
							return jsx("div", {
								children: x,
							});
						});
					} finally {
						_effect.f();
					}
				}
			`;

			await runTest(inputCode, expectedOutput, {
				detectTransformedJSX: true,
			});
		});
	});
});
