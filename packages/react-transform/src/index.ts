import {
	types as BabelTypes,
	template as BabelTemplate,
	PluginObj,
	PluginPass,
	NodePath,
	template,
} from "@babel/core";
import { isModule, addNamed } from "@babel/helper-module-imports";
import type { Scope, VisitNodeObject } from "@babel/traverse";
import debug from "debug";

interface PluginArgs {
	types: typeof BabelTypes;
	template: typeof BabelTemplate;
}

const optOutCommentIdentifier = /(^|\s)@no(Use|Track)Signals(\s|$)/;
const optInCommentIdentifier = /(^|\s)@(use|track)Signals(\s|$)/;
const dataNamespace = "@preact/signals-react-transform";
const defaultImportSource = "@preact/signals-react/runtime";
const importName = "useSignals";
const getHookIdentifier = "getHookIdentifier";
const maybeUsesSignal = "maybeUsesSignal";
const containsJSX = "containsJSX";
const alreadyTransformed = "alreadyTransformed";
const jsxIdentifiers = "jsxIdentifiers";
const jsxObjects = "jsxObjects";

const UNMANAGED = "0";
const MANAGED_COMPONENT = "1";
const MANAGED_HOOK = "2";
type HookUsage =
	| typeof UNMANAGED
	| typeof MANAGED_COMPONENT
	| typeof MANAGED_HOOK;

const logger = {
	transformed: debug("signals:react-transform:transformed"),
	skipped: debug("signals:react-transform:skipped"),
};

const get = (pass: PluginPass, name: any) =>
	pass.get(`${dataNamespace}/${name}`);
const set = (pass: PluginPass, name: string, v: any) =>
	pass.set(`${dataNamespace}/${name}`, v);

interface DataContainer {
	getData(name: string): any;
	setData(name: string, value: any): void;
}
const setData = (node: DataContainer, name: string, value: any) =>
	node.setData(`${dataNamespace}/${name}`, value);
const getData = (node: DataContainer, name: string) =>
	node.getData(`${dataNamespace}/${name}`);

function getComponentFunctionDeclaration(
	path: NodePath,
	filename: string | undefined,
	prev?: Scope
): Scope | null {
	const functionScope = path.scope.getFunctionParent();

	if (functionScope) {
		const parent = functionScope.path.parent;
		let functionName = getFunctionName(functionScope.path as any);
		if (functionName === DefaultExportSymbol) {
			functionName = filename || null;
		}
		if (isComponentFunction(functionScope.path as any, functionName)) {
			return functionScope;
		} else if (
			parent.type === "CallExpression" &&
			parent.callee.type === "Identifier" &&
			parent.callee.name.startsWith("use") &&
			parent.callee.name[3] === parent.callee.name[3].toUpperCase()
		) {
			return null;
		}
		return getComponentFunctionDeclaration(
			functionScope.parent.path,
			filename,
			functionScope
		);
	} else {
		return prev || null;
	}
}

function setOnFunctionScope(
	path: NodePath,
	key: string,
	value: any,
	filename: string | undefined
) {
	const functionScope = getComponentFunctionDeclaration(path, filename);
	if (functionScope) {
		setData(functionScope, key, value);
	}
}

type FunctionLike =
	| BabelTypes.ArrowFunctionExpression
	| BabelTypes.FunctionExpression
	| BabelTypes.FunctionDeclaration
	| BabelTypes.ObjectMethod;

/**
 * Simple "best effort" to get the base name of a file path. Not fool proof but
 * works in browsers and servers. Good enough for our purposes.
 */
function basename(filename: string | undefined): string | undefined {
	return filename?.split(/[\\/]/).pop();
}

const DefaultExportSymbol = Symbol("DefaultExportSymbol");

function getObjectPropertyKey(
	node: BabelTypes.ObjectProperty | BabelTypes.ObjectMethod
): string | null {
	if (node.key.type === "Identifier") {
		return node.key.name;
	} else if (node.key.type === "StringLiteral") {
		return node.key.value;
	}

	return null;
}

/**
 * If the function node has a name (i.e. is a function declaration with a
 * name), return that. Else return null.
 */
function getFunctionNodeName(node: FunctionLike): string | null {
	if (
		(node.type === "FunctionDeclaration" ||
			node.type === "FunctionExpression") &&
		node.id
	) {
		return node.id.name;
	} else if (node.type === "ObjectMethod") {
		return getObjectPropertyKey(node);
	}

	return null;
}

/**
 * Given a function path's parent path, determine the "name" associated with the
 * function. If the function is an inline default export (e.g. `export default
 * () => {}`), returns a symbol indicating it is a default export. If the
 * function is an anonymous function wrapped in higher order functions (e.g.
 * memo(() => {})) we'll climb through the higher order functions to find the
 * name of the variable that the function is assigned to, if any. Other cases
 * handled too (see implementation). Else returns null.
 */
function getFunctionNameFromParent(
	parentPath: NodePath<BabelTypes.Node>
): string | null | typeof DefaultExportSymbol {
	if (
		parentPath.node.type === "VariableDeclarator" &&
		parentPath.node.id.type === "Identifier"
	) {
		return parentPath.node.id.name;
	} else if (parentPath.node.type === "AssignmentExpression") {
		const left = parentPath.node.left;
		if (left.type === "Identifier") {
			return left.name;
		} else if (left.type === "MemberExpression") {
			let property = left.property;
			while (property.type === "MemberExpression") {
				property = property.property;
			}

			if (property.type === "Identifier") {
				return property.name;
			} else if (property.type === "StringLiteral") {
				return property.value;
			}

			return null;
		} else {
			return null;
		}
	} else if (parentPath.node.type === "ObjectProperty") {
		return getObjectPropertyKey(parentPath.node);
	} else if (parentPath.node.type === "ExportDefaultDeclaration") {
		return DefaultExportSymbol;
	} else if (
		parentPath.node.type === "CallExpression" &&
		parentPath.parentPath != null
	) {
		// If our parent is a Call Expression, then this function expression is
		// wrapped in some higher order functions. Recurse through the higher order
		// functions to determine if this expression is assigned to a name we can
		// use as the function name
		return getFunctionNameFromParent(parentPath.parentPath);
	} else {
		return null;
	}
}

/* Determine the name of a function */
function getFunctionName(
	path: NodePath<FunctionLike>
): string | typeof DefaultExportSymbol | null {
	let nodeName = getFunctionNodeName(path.node);
	if (nodeName) {
		return nodeName;
	}

	return getFunctionNameFromParent(path.parentPath);
}

function isComponentName(name: string | null): boolean {
	return name?.match(/^[A-Z]/) != null;
}
function isCustomHookName(name: string | null): boolean {
	return name?.match(/^use[A-Z]/) != null;
}

function hasLeadingComment(path: NodePath, comment: RegExp): boolean {
	const comments = path.node.leadingComments;
	return comments?.some(c => c.value.match(comment) !== null) ?? false;
}

function hasLeadingOptInComment(path: NodePath) {
	return hasLeadingComment(path, optInCommentIdentifier);
}

function hasLeadingOptOutComment(path: NodePath) {
	return hasLeadingComment(path, optOutCommentIdentifier);
}

function isOptedIntoSignalTracking(path: NodePath | null): boolean {
	if (!path) return false;

	switch (path.node.type) {
		case "ArrowFunctionExpression":
		case "FunctionExpression":
		case "FunctionDeclaration":
		case "ObjectMethod":
		case "ObjectExpression":
		case "VariableDeclarator":
		case "VariableDeclaration":
		case "AssignmentExpression":
		case "CallExpression":
			return (
				hasLeadingOptInComment(path) ||
				isOptedIntoSignalTracking(path.parentPath)
			);
		case "ExportDefaultDeclaration":
		case "ExportNamedDeclaration":
		case "ObjectProperty":
		case "ExpressionStatement":
			return hasLeadingOptInComment(path);
		default:
			return false;
	}
}

function isOptedOutOfSignalTracking(path: NodePath | null): boolean {
	if (!path) return false;

	switch (path.node.type) {
		case "ArrowFunctionExpression":
		case "FunctionExpression":
		case "FunctionDeclaration":
		case "ObjectMethod":
		case "ObjectExpression":
		case "VariableDeclarator":
		case "VariableDeclaration":
		case "AssignmentExpression":
		case "CallExpression":
			return (
				hasLeadingOptOutComment(path) ||
				isOptedOutOfSignalTracking(path.parentPath)
			);
		case "ExportDefaultDeclaration":
		case "ExportNamedDeclaration":
		case "ObjectProperty":
		case "ExpressionStatement":
			return hasLeadingOptOutComment(path);
		default:
			return false;
	}
}

function isComponentFunction(
	path: NodePath<FunctionLike>,
	functionName: string | null
): boolean {
	return (
		getData(path.scope, containsJSX) === true && // Function contains JSX
		isComponentName(functionName) // Function name indicates it's a component
	);
}

function shouldTransform(
	path: NodePath<FunctionLike>,
	functionName: string | null,
	options: PluginOptions
): boolean {
	// Opt-out takes first precedence
	if (isOptedOutOfSignalTracking(path)) return false;
	// Opt-in opts in to transformation regardless of mode
	if (isOptedIntoSignalTracking(path)) return true;

	if (options.mode === "all") {
		return isComponentFunction(path, functionName);
	}

	if (options.mode == null || options.mode === "auto") {
		return (
			getData(path.scope, maybeUsesSignal) === true && // Function appears to use signals;
			(isComponentFunction(path, functionName) ||
				isCustomHookName(functionName))
		);
	}

	return false;
}

function isValueMemberExpression(
	path: NodePath<BabelTypes.MemberExpression>
): boolean {
	return (
		(path.node.property.type === "Identifier" &&
			path.node.property.name === "value") ||
		(path.node.property.type === "StringLiteral" &&
			path.node.property.value === "value")
	);
}

function isJSXAlternativeCall(
	path: NodePath<BabelTypes.CallExpression>,
	state: PluginPass
): boolean {
	const jsxIdentifierSet = get(state, jsxIdentifiers) as Set<string>;
	const jsxObjectMap = get(state, jsxObjects) as Map<string, string[]>;
	const callee = path.get("callee");

	// Check direct function calls like _jsx("div", props) or createElement("div", props)
	if (callee.isIdentifier()) {
		return jsxIdentifierSet?.has(callee.node.name) ?? false;
	}

	// Check member expression calls like React.createElement("div", props) or jsxRuntime.jsx("div", props)
	if (callee.isMemberExpression()) {
		const object = callee.get("object");
		const property = callee.get("property");

		if (object.isIdentifier() && property.isIdentifier()) {
			const objectName = object.node.name;
			const methodName = property.node.name;
			const allowedMethods = jsxObjectMap?.get(objectName);
			return allowedMethods?.includes(methodName) ?? false;
		}
	}

	return false;
}

function hasValuePropertyInPattern(pattern: BabelTypes.ObjectPattern): boolean {
	for (const property of pattern.properties) {
		if (BabelTypes.isObjectProperty(property)) {
			const key = property.key;

			if (BabelTypes.isIdentifier(key, { name: "value" })) {
				return true;
			}
		}
	}
	return false;
}

const tryCatchTemplate = template.statements`var STORE_IDENTIFIER = HOOK_IDENTIFIER(HOOK_USAGE);
try {
	BODY
} finally {
	STORE_IDENTIFIER.f();
}`;

function wrapInTryFinally(
	t: typeof BabelTypes,
	path: NodePath<FunctionLike>,
	state: PluginPass,
	hookUsage: HookUsage
): BabelTypes.BlockStatement {
	const stopTrackingIdentifier = path.scope.generateUidIdentifier("effect");

	return t.blockStatement(
		tryCatchTemplate({
			STORE_IDENTIFIER: stopTrackingIdentifier,
			HOOK_IDENTIFIER: get(state, getHookIdentifier)(),
			HOOK_USAGE: hookUsage,
			BODY: t.isBlockStatement(path.node.body)
				? path.node.body.body // TODO: Is it okay to elide the block statement here?
				: t.returnStatement(path.node.body),
		})
	);
}

function prependUseSignals<T extends FunctionLike>(
	t: typeof BabelTypes,
	path: NodePath<T>,
	state: PluginPass
): BabelTypes.BlockStatement {
	const body = t.blockStatement([
		t.expressionStatement(
			t.callExpression(get(state, getHookIdentifier)(), [])
		),
	]);
	if (t.isBlockStatement(path.node.body)) {
		// TODO: Is it okay to elide the block statement here?
		body.body.push(...path.node.body.body);
	} else {
		body.body.push(t.returnStatement(path.node.body));
	}

	return body;
}

function transformFunction(
	t: typeof BabelTypes,
	options: PluginOptions,
	path: NodePath<FunctionLike>,
	functionName: string | null,
	state: PluginPass
) {
	const isHook = isCustomHookName(functionName);
	const isComponent = isComponentName(functionName);
	const hookUsage = options.experimental?.noTryFinally
		? UNMANAGED
		: isHook
			? MANAGED_HOOK
			: isComponent
				? MANAGED_COMPONENT
				: UNMANAGED;

	let newBody: BabelTypes.BlockStatement;
	if (hookUsage !== UNMANAGED) {
		newBody = wrapInTryFinally(t, path, state, hookUsage);
	} else {
		newBody = prependUseSignals(t, path, state);
	}

	setData(path, alreadyTransformed, true);
	path.get("body").replaceWith(newBody);
}

function createImportLazily(
	types: typeof BabelTypes,
	pass: PluginPass,
	path: NodePath<BabelTypes.Program>,
	importName: string,
	source: string
): () => BabelTypes.Identifier {
	return () => {
		if (isModule(path)) {
			let reference: BabelTypes.Identifier = get(pass, `imports/${importName}`);
			if (reference) return types.cloneNode(reference);
			reference = addNamed(path, importName, source, {
				importedInterop: "uncompiled",
				importPosition: "after",
			});
			set(pass, `imports/${importName}`, reference);

			/** Helper function to determine if an import declaration's specifier matches the given importName  */
			const matchesImportName = (
				s: BabelTypes.ImportDeclaration["specifiers"][0]
			) => {
				if (s.type !== "ImportSpecifier") return false;
				return (
					(s.imported.type === "Identifier" &&
						s.imported.name === importName) ||
					(s.imported.type === "StringLiteral" &&
						s.imported.value === importName)
				);
			};

			for (let statement of path.get("body")) {
				if (
					statement.isImportDeclaration() &&
					statement.node.source.value === source &&
					statement.node.specifiers.some(matchesImportName)
				) {
					path.scope.registerDeclaration(statement);
					break;
				}
			}

			return reference;
		} else {
			// This code originates from
			// https://github.com/XantreDev/preact-signals/blob/%40preact-signals/safe-react%400.6.1/packages/react/src/babel.ts#L390-L400
			let reference = get(pass, `requires/${importName}`);
			if (reference) {
				reference = types.cloneNode(reference);
			} else {
				reference = addNamed(path, importName, source, {
					importedInterop: "uncompiled",
				});
				set(pass, `requires/${importName}`, reference);
			}

			return reference;
		}
	};
}

function detectJSXAlternativeImports(
	path: NodePath<BabelTypes.Program>,
	state: PluginPass
) {
	const jsxIdentifierSet = new Set<string>();
	const jsxObjectMap = new Map<string, string[]>();

	const jsxPackages = {
		"react/jsx-runtime": ["jsx", "jsxs"],
		"react/jsx-dev-runtime": ["jsxDEV"],
		react: ["createElement"],
	};

	path.traverse({
		ImportDeclaration(importPath) {
			const packageName = importPath.node.source.value;
			const jsxMethods = jsxPackages[packageName as keyof typeof jsxPackages];

			if (!jsxMethods) {
				return;
			}

			for (const specifier of importPath.node.specifiers) {
				if (
					specifier.type === "ImportSpecifier" &&
					specifier.imported.type === "Identifier"
				) {
					// Check if this is a function we care about
					if (jsxMethods.includes(specifier.imported.name)) {
						jsxIdentifierSet.add(specifier.local.name);
					}
				} else if (specifier.type === "ImportDefaultSpecifier") {
					// Handle default imports - add to objects map for member access
					jsxObjectMap.set(specifier.local.name, jsxMethods);
				}
			}
		},
		VariableDeclarator(varPath) {
			const init = varPath.get("init");

			if (init.isCallExpression()) {
				const callee = init.get("callee");
				const args = init.get("arguments");

				if (
					callee.isIdentifier() &&
					callee.node.type === "Identifier" &&
					callee.node.name === "require" &&
					args.length > 0 &&
					args[0].isStringLiteral()
				) {
					const packageName = args[0].node.value;
					const jsxMethods =
						jsxPackages[packageName as keyof typeof jsxPackages];

					if (jsxMethods) {
						if (varPath.node.id.type === "Identifier") {
							// Handle CJS require like: const React = require("react")
							jsxObjectMap.set(varPath.node.id.name, jsxMethods);
						} else if (varPath.node.id.type === "ObjectPattern") {
							// Handle destructured CJS require like: const { createElement } = require("react")
							for (const prop of varPath.node.id.properties) {
								if (
									prop.type === "ObjectProperty" &&
									prop.key.type === "Identifier" &&
									prop.value.type === "Identifier" &&
									jsxMethods.includes(prop.key.name)
								) {
									jsxIdentifierSet.add(prop.value.name);
								}
							}
						}
					}
				}
			}
		},
	});

	set(state, jsxIdentifiers, jsxIdentifierSet);
	set(state, jsxObjects, jsxObjectMap);
}

export interface PluginOptions {
	/**
	 * Specify the mode to use:
	 * - `auto`: Automatically wrap all components that use signals.
	 * - `manual`: Only wrap components that are annotated with `@useSignals` in a JSX comment.
	 * - `all`: Makes all components reactive to signals.
	 */
	mode?: "auto" | "manual" | "all";
	/** Specify a custom package to import the `useSignals` hook from. */
	importSource?: string;
	/**
	 * Detect JSX elements created using alternative methods like jsx-runtime or createElement calls.
	 * When enabled, detects patterns from react/jsx-runtime and react packages.
	 * @default false
	 */
	detectTransformedJSX?: boolean;
	experimental?: {
		/**
		 * If set to true, the component body will not be wrapped in a try/finally
		 * block and instead the next component render or a microtick will stop
		 * tracking signals for this component. This is an experimental feature and
		 * may be removed in the future.
		 * @default false
		 */
		noTryFinally?: boolean;
	};
}

function log(
	transformed: boolean,
	path: NodePath<FunctionLike>,
	functionName: string | null,
	currentFile: string | undefined
) {
	if (!logger.transformed.enabled && !logger.skipped.enabled) return;

	let cwd = "";
	if (typeof process !== undefined && typeof process.cwd == "function") {
		cwd = process.cwd().replace(/\\([^ ])/g, "/$1");
		cwd = cwd.endsWith("/") ? cwd : cwd + "/";
	}

	const relativePath = currentFile?.replace(cwd, "") ?? "";
	const lineNum = path.node.loc?.start.line;
	functionName = functionName ?? "<anonymous>";

	if (transformed) {
		logger.transformed(`${functionName} (${relativePath}:${lineNum})`);
	} else {
		logger.skipped(`${functionName} (${relativePath}:${lineNum}) %o`, {
			hasSignals: getData(path.scope, maybeUsesSignal) ?? false,
			hasJSX: getData(path.scope, containsJSX) ?? false,
		});
	}
}

function isComponentLike(
	path: NodePath<FunctionLike>,
	functionName: string | null
): boolean {
	return !getData(path, alreadyTransformed) && isComponentName(functionName);
}

export default function signalsTransform(
	{ types: t }: PluginArgs,
	options: PluginOptions
): PluginObj {
	// TODO: Consider alternate implementation, where on enter of a function
	// expression, we run our own manual scan the AST to determine if the
	// function uses signals and is a component. This manual scan once upon
	// seeing a function would probably be faster than running an entire
	// babel pass with plugins on components twice.
	const visitFunction: VisitNodeObject<PluginPass, FunctionLike> = {
		exit(path, state) {
			if (getData(path, alreadyTransformed) === true) return false;

			let functionName = getFunctionName(path);
			if (functionName === DefaultExportSymbol) {
				functionName = basename(this.filename) ?? null;
			}

			if (shouldTransform(path, functionName, state.opts)) {
				transformFunction(t, state.opts, path, functionName, state);
				log(true, path, functionName, this.filename);
			} else if (isComponentLike(path, functionName)) {
				log(false, path, functionName, this.filename);
			}
		},
	};

	return {
		name: "@preact/signals-transform",
		visitor: {
			Program: {
				enter(path, state) {
					// Following the pattern of babel-plugin-transform-react-jsx, we
					// lazily create the import statement for the useSignalTracking hook.
					// We create a function and store it in the PluginPass object, so that
					// on the first usage of the hook, we can create the import statement.
					set(
						state,
						getHookIdentifier,
						createImportLazily(
							t,
							state,
							path,
							importName,
							options.importSource ?? defaultImportSource
						)
					);

					if (options.detectTransformedJSX) {
						detectJSXAlternativeImports(path, state);
					}
				},
			},

			ArrowFunctionExpression: visitFunction,
			FunctionExpression: visitFunction,
			FunctionDeclaration: visitFunction,
			ObjectMethod: visitFunction,

			CallExpression(path, state) {
				if (options.detectTransformedJSX) {
					if (isJSXAlternativeCall(path, state)) {
						setOnFunctionScope(path, containsJSX, true, this.filename);
					}
				}
			},

			MemberExpression(path) {
				if (isValueMemberExpression(path)) {
					setOnFunctionScope(path, maybeUsesSignal, true, this.filename);
				}
			},

			ObjectPattern(path) {
				if (hasValuePropertyInPattern(path.node)) {
					setOnFunctionScope(path, maybeUsesSignal, true, this.filename);
				}
			},

			JSXElement(path) {
				setOnFunctionScope(path, containsJSX, true, this.filename);
			},
			JSXFragment(path) {
				setOnFunctionScope(path, containsJSX, true, this.filename);
			},
		},
	};
}
