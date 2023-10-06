/* eslint no-console: 0 */

import prettier from "prettier";

interface InputOutput {
	input: string;
	transformed: string;
}

interface TestCase extends InputOutput {
	name: string;
}

interface FuncDeclComponent {
	type: "FuncDeclComp";
	name?: string;
	body: string;
}

interface FuncExpComponent {
	type: "FuncExpComp";
	name?: string;
	body: string;
}

interface ArrowFuncComponent {
	type: "ArrowComp";
	return: "statement" | "expression";
	body: string;
}

interface CallExp {
	type: "CallExp";
	name: string;
	args: Array<Component | string>;
}

type Component = FuncDeclComponent | FuncExpComponent | ArrowFuncComponent;
type Node = Component | CallExp | string;

interface NodeTypes {
	String: string;
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

const codeGenerators: Generators = {
	String: config => ({ input: config, transformed: config }),
	FuncDeclComp(config) {
		const body = generateCode(config.body);
		const outputBody = applyTransform(body.transformed);
		return {
			input: `function ${config.name}() {\n${body.input}\n}`,
			transformed: `function ${config.name}() {\n${outputBody}\n}`,
		};
	},
	FuncExpComp(config) {
		const body = generateCode(config.body);
		const outputBody = applyTransform(body.transformed);
		return {
			input: `(function ${config.name ?? ""}() {\n${body.input}\n})`,
			transformed: `(function ${config.name ?? ""}() {\n${outputBody}\n})`,
		};
	},
	ArrowComp(config) {
		const body = generateCode(config.body);
		const inputBody =
			config.return === "statement" ? `{\n${body.input}\n}` : body.input;
		const outputBody = applyTransform(
			body.transformed,
			config.return === "expression",
		);
		return {
			input: `() => ${inputBody}`,
			transformed: `() => {\n${outputBody}\n}`,
		};
	},
	CallExp(config) {
		const result = `${config.name}(${config.args
			.map(arg => generateCode(arg))
			.join(", ")})`;

		return { input: result, transformed: result };
	},
};

function generateCode(config: Node): InputOutput {
	const type = typeof config === "string" ? "String" : config.type;
	return codeGenerators[type](config as any);
}

// TODO: Consider returning an object { auto: [], noAuto: [] }
function autoTransformedDeclComp(baseName: string) {
	return [
		{
			name: baseName + " func declaration",
			...generateCode({
				type: "FuncDeclComp",
				name: "App",
				body: "return <>{signal.value}</>",
			}),
		},
	];
}

function autoTransformedExpComp(baseName: string): TestCase[] {
	return [
		{
			name: baseName + " func expression",
			...generateCode({
				type: "FuncExpComp",
				body: "return <div>{signal.value}</div>",
			}),
		},
		{
			name: baseName + " func expression with name",
			...generateCode({
				type: "FuncExpComp",
				name: "App",
				body: "return <div>{signal.value}</div>",
			}),
		},
		{
			name: baseName + " arrow func expression with statement body",
			...generateCode({
				type: "ArrowComp",
				return: "statement",
				body: "return <div>{signal.value}</div>",
			}),
		},
		{
			name: baseName + " arrow func expression with expression body",
			...generateCode({
				type: "ArrowComp",
				return: "expression",
				body: "<div>{signal.value}</div>",
			}),
		},
	];
}

function noAutoTransformedDeclComp(baseName: string) {
	return [
		{
			name: baseName + " func declaration with improper name",
			...generateCode({
				type: "FuncDeclComp",
				name: "app",
				body: "return <div>{signal.value}</div>",
			}),
		},
		{
			name: baseName + " func declaration with no JSX",
			...generateCode({
				type: "FuncDeclComp",
				name: "App",
				body: "return signal.value",
			}),
		},
		{
			name: baseName + " func declaration with no signals",
			...generateCode({
				type: "FuncDeclComp",
				name: "App",
				body: "return <div>Hello World</div>",
			}),
		},
	];
}

function noAutoTransformedExpComp(baseName: string): TestCase[] {
	return [
		{
			name: baseName + " func expression with no JSX",
			...generateCode({
				type: "FuncExpComp",
				body: "return signal.value",
			}),
		},
		{
			name: baseName + " func expression with no signals",
			...generateCode({
				type: "FuncExpComp",
				body: "return <div>Hello World</div>",
			}),
		},
		{
			name: baseName + " arrow func expression with no JSX",
			...generateCode({
				type: "ArrowComp",
				return: "expression",
				body: "signal.value",
			}),
		},
		{
			name: baseName + " arrow func expression with no signals",
			...generateCode({
				type: "ArrowComp",
				return: "expression",
				body: "<div>Hello World</div>",
			}),
		},
	];
}

const format = (code: string) => prettier.format(code, { parser: "babel" });

async function run() {
	for (const testCase of [
		...autoTransformedDeclComp("transforms a"),
		...autoTransformedExpComp("transforms a"),
		...noAutoTransformedDeclComp("does not transform a"),
		...noAutoTransformedExpComp("does not transform a"),
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
