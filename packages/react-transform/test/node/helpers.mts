/* eslint no-console: 0 */

import prettier from "prettier";

interface InputOutput {
	input: string;
	transformed: string;
}

type ParamsConfig = 0 | 1 | 2 | 3 | undefined;

interface FuncDeclComponent {
	type: "FuncDeclComp";
	name?: string;
	body: string;
	params?: ParamsConfig;
}

interface FuncExpComponent {
	type: "FuncExpComp";
	name?: string;
	body: string;
	params?: ParamsConfig;
}

interface ArrowFuncComponent {
	type: "ArrowComp";
	return: "statement" | "expression";
	body: string;
	params?: ParamsConfig;
}

interface CallExp {
	type: "CallExp";
	name: string;
	args: Array<InputOutput>;
}

type Node = FuncDeclComponent | FuncExpComponent | ArrowFuncComponent | CallExp;

interface NodeTypes {
	FuncDeclComp: FuncDeclComponent;
	FuncExpComp: FuncExpComponent;
	ArrowComp: ArrowFuncComponent;
	CallExp: CallExp;
}

type Generators = {
	[key in keyof NodeTypes]: (config: NodeTypes[key]) => InputOutput;
};

function applyTransform(body: string, addReturn = false): string {
	return `var _effect = _useSignals();
	try {
		${addReturn ? "return " : ""}${body}
	} finally {
		_effect.f();
	}`;
}

function generateParams(count?: ParamsConfig): string {
	if (count == null || count === 0) return "";
	if (count === 1) return "props";
	if (count === 2) return "props, ref";
	return Array.from({ length: count }, (_, i) => `arg${i}`).join(", ");
}

const codeGenerators: Generators = {
	FuncDeclComp(config) {
		const params = generateParams(config.params);
		const inputBody = config.body;
		const outputBody = applyTransform(config.body);
		return {
			input: `function ${config.name}(${params}) {\n${inputBody}\n}`,
			transformed: `function ${config.name}(${params}) {\n${outputBody}\n}`,
		};
	},
	FuncExpComp(config) {
		const name = config.name ?? "";
		const params = generateParams(config.params);
		const inputBody = config.body;
		const outputBody = applyTransform(config.body);
		return {
			input: `(function ${name}(${params}) {\n${inputBody}\n})`,
			transformed: `(function ${name}(${params}) {\n${outputBody}\n})`,
		};
	},
	ArrowComp(config) {
		const params = generateParams(config.params);
		const isExpBody = config.return === "expression";
		const inputBody = isExpBody ? config.body : `{\n${config.body}\n}`;
		const outputBody = applyTransform(config.body, isExpBody);
		return {
			input: `(${params}) => ${inputBody}`,
			transformed: `(${params}) => {\n${outputBody}\n}`,
		};
	},
	CallExp(config) {
		return {
			input: `${config.name}(${config.args.map(arg => arg.input).join(", ")})`,
			transformed: `${config.name}(${config.args
				.map(arg => arg.transformed)
				.join(", ")})`,
		};
	},
};

function generateCode(config: Node): InputOutput {
	return codeGenerators[config.type](config as any);
}

interface TestCase extends InputOutput {
	name: string;
}

interface TestCaseConfig {
	name: string;
	auto: boolean;
	params?: ParamsConfig;
}

function declarationComponents(config: TestCaseConfig): TestCase[] {
	const { name: baseName, params } = config;
	if (config.auto) {
		return [
			{
				name: baseName + " func declaration",
				...generateCode({
					type: "FuncDeclComp",
					name: "App",
					body: "return <>{signal.value}</>",
					params,
				}),
			},
		];
	} else {
		return [
			{
				name: baseName + " func declaration with improper name",
				...generateCode({
					type: "FuncDeclComp",
					name: "app",
					body: "return <div>{signal.value}</div>",
					params,
				}),
			},
			{
				name: baseName + " func declaration with no JSX",
				...generateCode({
					type: "FuncDeclComp",
					name: "App",
					body: "return signal.value",
					params,
				}),
			},
			{
				name: baseName + " func declaration with no signals",
				...generateCode({
					type: "FuncDeclComp",
					name: "App",
					body: "return <div>Hello World</div>",
					params,
				}),
			},
		];
	}
}

function expressionComponents(config: TestCaseConfig): TestCase[] {
	const { name: baseName, params } = config;
	if (config.auto) {
		return [
			{
				name: baseName + " func expression",
				...generateCode({
					type: "FuncExpComp",
					body: "return <div>{signal.value}</div>",
					params,
				}),
			},
			{
				name: baseName + " func expression with name",
				...generateCode({
					type: "FuncExpComp",
					name: "App",
					body: "return <div>{signal.value}</div>",
					params,
				}),
			},
			{
				name: baseName + " arrow func expression with statement body",
				...generateCode({
					type: "ArrowComp",
					return: "statement",
					body: "return <div>{signal.value}</div>",
					params,
				}),
			},
			{
				name: baseName + " arrow func expression with expression body",
				...generateCode({
					type: "ArrowComp",
					return: "expression",
					body: "<div>{signal.value}</div>",
					params,
				}),
			},
		];
	} else {
		return [
			{
				name: baseName + " func expression with no JSX",
				...generateCode({
					type: "FuncExpComp",
					body: "return signal.value",
					params,
				}),
			},
			{
				name: baseName + " func expression with no signals",
				...generateCode({
					type: "FuncExpComp",
					body: "return <div>Hello World</div>",
					params,
				}),
			},
			{
				name: baseName + " arrow func expression with no JSX",
				...generateCode({
					type: "ArrowComp",
					return: "expression",
					body: "signal.value",
					params,
				}),
			},
			{
				name: baseName + " arrow func expression with no signals",
				...generateCode({
					type: "ArrowComp",
					return: "expression",
					body: "<div>Hello World</div>",
					params,
				}),
			},
		];
	}
}

function withCallExpWrappers(config: TestCaseConfig): TestCase[] {
	const testCases: TestCase[] = [];

	// Simulate a component wrapped memo
	const memoedComponents = expressionComponents({ ...config, params: 1 });
	for (let component of memoedComponents) {
		testCases.push({
			name: component.name + " wrapped in memo",
			...generateCode({
				type: "CallExp",
				name: "memo",
				args: [component],
			}),
		});
	}

	// Simulate a component wrapped in forwardRef
	const forwardRefComponents = expressionComponents({ ...config, params: 2 });
	for (let component of forwardRefComponents) {
		testCases.push({
			name: component.name + " wrapped in forwardRef",
			...generateCode({
				type: "CallExp",
				name: "forwardRef",
				args: [component],
			}),
		});
	}

	//Simulate components wrapped in both memo and forwardRef
	for (let component of forwardRefComponents) {
		testCases.push({
			name: component.name + " wrapped in memo and forwardRef",
			...generateCode({
				type: "CallExp",
				name: "memo",
				args: [
					generateCode({
						type: "CallExp",
						name: "forwardRef",
						args: [component],
					}),
				],
			}),
		});
	}

	return testCases;
}

const format = (code: string) => prettier.format(code, { parser: "babel" });

async function run() {
	for (const testCase of [
		// ...declarationComponents({ name: "transforms a", auto: true }),
		// ...declarationComponents({ name: "does not transform a", auto: false }),
		// ...expressionComponents({ name: "transforms a", auto: true }),
		// ...expressionComponents({ name: "does not transform a", auto: false }),
		...withCallExpWrappers({ name: "transforms a", auto: true }),
		...withCallExpWrappers({ name: "does not transform a", auto: false }),
	]) {
		console.log("=".repeat(80));
		console.log(testCase.name);
		console.log("input:");
		console.log(await format(testCase.input));
		console.log("transformed:");
		console.log(await format(testCase.transformed));
		console.log();

		// it(testCase.name, () => {
		// 	const input = testCase.input;
		// 	const expected = testCase.output;
		// 	const output = transformCode(input);
		// 	expect(toSpaces(output)).to.equal(toSpaces(dedent(expected)));
		// });
	}
}

run();
