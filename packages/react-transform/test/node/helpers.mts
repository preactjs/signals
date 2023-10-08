/* eslint no-console: 0 */

import prettier from "prettier";

interface InputOutput {
	input: string;
	transformed: string;
}

type VariableKind = "var" | "let" | "const";
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

interface Variable {
	type: "Variable";
	name: string;
	body: InputOutput;
	kind?: VariableKind;
}

interface Assignment {
	type: "Assignment";
	name: string;
	body: InputOutput;
	kind?: VariableKind;
}

interface ObjectProperty {
	type: "ObjectProperty";
	name: string;
	body: InputOutput;
}

interface ExportDefault {
	type: "ExportDefault";
	body: InputOutput;
}

interface ExportNamed {
	type: "ExportNamed";
	body: InputOutput;
}

type Node =
	| FuncDeclComponent
	| FuncExpComponent
	| ArrowFuncComponent
	| CallExp
	| Variable
	| Assignment
	| ObjectProperty
	| ExportDefault
	| ExportNamed;

interface NodeTypes {
	FuncDeclComp: FuncDeclComponent;
	FuncExpComp: FuncExpComponent;
	ArrowComp: ArrowFuncComponent;
	CallExp: CallExp;
	ExportDefault: ExportDefault;
	ExportNamed: ExportNamed;
	Variable: Variable;
	Assignment: Assignment;
	ObjectProperty: ObjectProperty;
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
	Variable(config) {
		const kind = config.kind ?? "const";
		return {
			input: `${kind} ${config.name} = ${config.body.input}`,
			transformed: `${kind} ${config.name} = ${config.body.transformed}`,
		};
	},
	Assignment(config) {
		const kind = config.kind ?? "let";
		return {
			input: `${kind} ${config.name};\n ${config.name} = ${config.body.input}`,
			transformed: `${kind} ${config.name};\n ${config.name} = ${config.body.transformed}`,
		};
	},
	ObjectProperty(config) {
		return {
			input: `{\n ${config.name}: ${config.body.input} \n}`,
			transformed: `{\n ${config.name}: ${config.body.transformed} \n}`,
		};
	},
	ExportDefault(config) {
		return {
			input: `export default ${config.body.input}`,
			transformed: `export default ${config.body.transformed}`,
		};
	},
	ExportNamed(config) {
		return {
			input: `export ${config.body.input}`,
			transformed: `export ${config.body.transformed}`,
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
				name: baseName + " func expression with bad name",
				...generateCode({
					type: "FuncExpComp",
					name: "app",
					body: "return signal.value",
					params,
				}),
			},
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

function declarationComp(config: TestCaseConfig): TestCase[] {
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

function variableComp(config: TestCaseConfig): TestCase[] {
	const testCases: TestCase[] = [];

	const components = expressionComponents(config);
	for (const c of components) {
		testCases.push({
			name: c.name + " assigned to variable declaration",
			...generateCode({
				type: "Variable",
				name: "VarComp",
				body: c,
			}),
		});
	}

	const hocComponents = withCallExpWrappers(config);
	for (const c of hocComponents) {
		testCases.push({
			name: c.name + " assigned to variable declaration",
			...generateCode({
				type: "Variable",
				name: "VarComp",
				body: c,
			}),
		});
	}

	if (!config.auto) {
		testCases.push({
			name: `${config.name} func expression assigned to variable declaration with improper name`,
			...generateCode({
				type: "Variable",
				name: "render",
				body: generateCode({
					type: "FuncExpComp",
					body: "return <div>{signal.value}</div>",
				}),
			}),
		});

		testCases.push({
			name: `${config.name} arrow func expression assigned to variable declaration with improper name`,
			...generateCode({
				type: "Variable",
				name: "render",
				body: generateCode({
					type: "ArrowComp",
					return: "expression",
					body: "<div>{signal.value}</div>",
				}),
			}),
		});

		testCases.push({
			name: `${config.name} func expression assigned to variable declaration with improper name wrapped in memo and forwardRef`,
			...generateCode({
				type: "Variable",
				name: "render",
				body: generateCode({
					type: "CallExp",
					name: "memo",
					args: [
						generateCode({
							type: "CallExp",
							name: "forwardRef",
							args: [
								generateCode({
									type: "FuncExpComp",
									body: "return <div>{signal.value}</div>",
								}),
							],
						}),
					],
				}),
			}),
		});

		testCases.push({
			name: `${config.name} arrow func expression assigned to variable declaration with improper name wrapped in memo and forwardRef`,
			...generateCode({
				type: "Variable",
				name: "render",
				body: generateCode({
					type: "CallExp",
					name: "memo",
					args: [
						generateCode({
							type: "CallExp",
							name: "forwardRef",
							args: [
								generateCode({
									type: "ArrowComp",
									return: "expression",
									body: "<div>{signal.value}</div>",
								}),
							],
						}),
					],
				}),
			}),
		});
	}

	return testCases;
}

function assignmentComp(config: TestCaseConfig): TestCase[] {
	const testCases: TestCase[] = [];

	const components = expressionComponents(config);
	for (const c of components) {
		testCases.push({
			name: c.name + " assigned to variable",
			...generateCode({
				type: "Assignment",
				name: "AssignComp",
				body: c,
			}),
		});
	}

	const hocComponents = withCallExpWrappers(config);
	for (const c of hocComponents) {
		testCases.push({
			name: c.name + " assigned to variable",
			...generateCode({
				type: "Assignment",
				name: "AssignComp",
				body: c,
			}),
		});
	}

	if (!config.auto) {
		testCases.push({
			name: `${config.name} func expression assigned to variable with improper name`,
			...generateCode({
				type: "Assignment",
				name: "render",
				body: generateCode({
					type: "FuncExpComp",
					body: "return <div>{signal.value}</div>",
				}),
			}),
		});

		testCases.push({
			name: `${config.name} arrow func expression assigned to variable with improper name`,
			...generateCode({
				type: "Assignment",
				name: "render",
				body: generateCode({
					type: "ArrowComp",
					return: "expression",
					body: "<div>{signal.value}</div>",
				}),
			}),
		});

		testCases.push({
			name: `${config.name} func expression assigned to variable with improper name wrapped in memo and forwardRef`,
			...generateCode({
				type: "Assignment",
				name: "render",
				body: generateCode({
					type: "CallExp",
					name: "memo",
					args: [
						generateCode({
							type: "CallExp",
							name: "forwardRef",
							args: [
								generateCode({
									type: "FuncExpComp",
									body: "return <div>{signal.value}</div>",
								}),
							],
						}),
					],
				}),
			}),
		});

		testCases.push({
			name: `${config.name} arrow func expression assigned to variable with improper name wrapped in memo and forwardRef`,
			...generateCode({
				type: "Assignment",
				name: "render",
				body: generateCode({
					type: "CallExp",
					name: "memo",
					args: [
						generateCode({
							type: "CallExp",
							name: "forwardRef",
							args: [
								generateCode({
									type: "ArrowComp",
									return: "expression",
									body: "<div>{signal.value}</div>",
								}),
							],
						}),
					],
				}),
			}),
		});
	}

	return testCases;
}

function objectPropertyComp(config: TestCaseConfig): TestCase[] {
	const testCases: TestCase[] = [];

	const components = expressionComponents(config);
	for (const c of components) {
		testCases.push({
			name: c.name + " assigned to object property",
			...generateCode({
				type: "ObjectProperty",
				name: "ObjComp",
				body: c,
			}),
		});
	}

	const hocComponents = withCallExpWrappers(config);
	for (const c of hocComponents) {
		testCases.push({
			name: c.name + " assigned to object property",
			...generateCode({
				type: "ObjectProperty",
				name: "ObjComp",
				body: c,
			}),
		});
	}

	if (!config.auto) {
		testCases.push({
			name: `${config.name} func expression assigned to object prop with improper name`,
			...generateCode({
				type: "ObjectProperty",
				name: "render_prop",
				body: generateCode({
					type: "FuncExpComp",
					body: "return <div>{signal.value}</div>",
				}),
			}),
		});

		testCases.push({
			name: `${config.name} arrow func expression assigned to object prop with improper name`,
			...generateCode({
				type: "ObjectProperty",
				name: "render_prop",
				body: generateCode({
					type: "ArrowComp",
					return: "expression",
					body: "<div>{signal.value}</div>",
				}),
			}),
		});

		testCases.push({
			name: `${config.name} func expression assigned to object prop with improper name wrapped in memo and forwardRef`,
			...generateCode({
				type: "ObjectProperty",
				name: "render_prop",
				body: generateCode({
					type: "CallExp",
					name: "memo",
					args: [
						generateCode({
							type: "CallExp",
							name: "forwardRef",
							args: [
								generateCode({
									type: "FuncExpComp",
									body: "return <div>{signal.value}</div>",
								}),
							],
						}),
					],
				}),
			}),
		});

		testCases.push({
			name: `${config.name} arrow func expression assigned to object prop with improper name wrapped in memo and forwardRef`,
			...generateCode({
				type: "ObjectProperty",
				name: "render_prop",
				body: generateCode({
					type: "CallExp",
					name: "memo",
					args: [
						generateCode({
							type: "CallExp",
							name: "forwardRef",
							args: [
								generateCode({
									type: "ArrowComp",
									return: "expression",
									body: "<div>{signal.value}</div>",
								}),
							],
						}),
					],
				}),
			}),
		});
	}

	return testCases;
}

function exportDefaultComp(config: TestCaseConfig): TestCase[] {
	const testCases: TestCase[] = [];

	const components = expressionComponents(config);
	for (const c of components) {
		testCases.push({
			name: c.name + " exported as default",
			...generateCode({
				type: "ExportDefault",
				body: c,
			}),
		});
	}

	const hocComponents = withCallExpWrappers(config);
	for (const c of hocComponents) {
		testCases.push({
			name: c.name + " exported as default",
			...generateCode({
				type: "ExportDefault",
				body: c,
			}),
		});
	}

	return testCases;
}

function exportNamedComp(config: TestCaseConfig): TestCase[] {
	const testCases: TestCase[] = [];

	const varComponents = variableComp(config);
	for (const c of varComponents) {
		const name = c.name.replace(" assigned to variable declaration", "");
		testCases.push({
			name: name + " exported as named",
			...generateCode({
				type: "ExportNamed",
				body: c,
			}),
		});
	}

	const funcComponents = declarationComp(config);
	for (const c of funcComponents) {
		const name = c.name.replace(" assigned to variable declaration", "");
		testCases.push({
			name: name + " exported as named",
			...generateCode({
				type: "ExportNamed",
				body: c,
			}),
		});
	}

	return testCases;
}

const format = (code: string) => prettier.format(code, { parser: "babel" });

async function run() {
	console.log("generating...");
	console.time("generated");
	const testCases: TestCase[] = [
		// ...declarationComponents({ name: "transforms a", auto: true }),
		// ...declarationComponents({ name: "does not transform a", auto: false }),
		//
		// ...expressionComponents({ name: "transforms a", auto: true }),
		// ...expressionComponents({ name: "does not transform a", auto: false }),
		//
		// ...withCallExpWrappers({ name: "transforms a", auto: true }),
		// ...withCallExpWrappers({ name: "does not transform a", auto: false }),
		//
		...variableComp({ name: "transforms a", auto: true }),
		...variableComp({ name: "does not transform a", auto: false }),

		...assignmentComp({ name: "transforms a", auto: true }),
		...assignmentComp({ name: "does not transform a", auto: false }),

		...objectPropertyComp({ name: "transforms a", auto: true }),
		...objectPropertyComp({ name: "does not transform a", auto: false }),

		...exportDefaultComp({ name: "transforms a", auto: true }),
		...exportDefaultComp({ name: "does not transform a", auto: false }),

		...exportNamedComp({ name: "transforms a", auto: true }),
		...exportNamedComp({ name: "does not transform a", auto: false }),
	];
	console.timeEnd("generated");

	for (const testCase of testCases) {
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
