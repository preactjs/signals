import {
	types as BabelTypes,
	template as BabelTemplate,
	PluginObj,
	PluginPass,
	NodePath,
	template,
} from "@babel/core";
import { isModule, addNamed } from "@babel/helper-module-imports";

interface PluginArgs {
	types: typeof BabelTypes;
	template: typeof BabelTemplate;
}

const optOutCommentIdentifier = /(^|\s)@noTrackSignals(\s|$)/;
const optInCommentIdentifier = /(^|\s)@trackSignals(\s|$)/;
const dataNamespace = "@preact/signals-react-transform";
const defaultImportSource = "@preact/signals-react/runtime";
const importName = "useSignals";
const getHookIdentifier = "getHookIdentifier";
const maybeUsesSignal = "maybeUsesSignal";
const containsJSX = "containsJSX";
const alreadyTransformed = "alreadyTransformed";

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

function setOnFunctionScope(path: NodePath, key: string, value: any) {
	const functionScope = path.scope.getFunctionParent();
	if (functionScope) {
		setData(functionScope, key, value);
	}
}

type FunctionLike =
	| BabelTypes.ArrowFunctionExpression
	| BabelTypes.FunctionExpression
	| BabelTypes.FunctionDeclaration;

/**
 * Simple "best effort" to get the base name of a file path. Not fool proof but
 * works in browsers and servers. Good enough for our purposes.
 */
function basename(filename: string | undefined): string | undefined {
	return filename?.split(/[\\/]/).pop();
}

const DefaultExportSymbol = Symbol("DefaultExportSymbol");

/**
 * If the function node has a name (i.e. is a function declaration with a
 * name), return that. Else return null.
 */
function getFunctionNodeName(node: NodePath<FunctionLike>): string | null {
	return node.node.type === "FunctionDeclaration" && node.node.id
		? node.node.id.name
		: null;
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
	} else if (
		parentPath.node.type === "AssignmentExpression" &&
		parentPath.node.left.type === "Identifier"
	) {
		return parentPath.node.left.name;
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
	let nodeName = getFunctionNodeName(path);
	if (nodeName) {
		return nodeName;
	}

	return getFunctionNameFromParent(path.parentPath);
}

function fnNameStartsWithCapital(
	path: NodePath<FunctionLike>,
	filename: string | undefined
): boolean {
	const name = getFunctionName(path);
	if (!name) return false;
	if (name === DefaultExportSymbol) {
		return basename(filename)?.match(/^[A-Z]/) != null ?? false;
	}
	return name.match(/^[A-Z]/) != null;
}
function fnNameStartsWithUse(
	path: NodePath<FunctionLike>,
	filename: string | undefined
): boolean {
	const name = getFunctionName(path);
	if (!name) return false;
	if (name === DefaultExportSymbol) {
		return basename(filename)?.match(/^use[A-Z]/) != null ?? false;
	}

	return name.match(/^use[A-Z]/) != null;
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
	filename: string | undefined
): boolean {
	return (
		getData(path.scope, containsJSX) === true && // Function contains JSX
		fnNameStartsWithCapital(path, filename) // Function name indicates it's a component
	);
}

function isCustomHook(
	path: NodePath<FunctionLike>,
	filename: string | undefined
): boolean {
	return (
		path.scope.parent === path.scope.getProgramParent() && // Function is top-level
		fnNameStartsWithUse(path, filename) // Function name indicates it's a hook
	);
}

function shouldTransform(
	path: NodePath<FunctionLike>,
	filename: string | undefined,
	options: PluginOptions
): boolean {
	if (getData(path, alreadyTransformed) === true) return false;

	// Opt-out takes first precedence
	if (isOptedOutOfSignalTracking(path)) return false;
	// Opt-in opts in to transformation regardless of mode
	if (isOptedIntoSignalTracking(path)) return true;

	if (options.mode === "all") {
		return isComponentFunction(path, filename);
	}

	if (options.mode == null || options.mode === "auto") {
		return (
			getData(path.scope, maybeUsesSignal) === true && // Function appears to use signals;
			(isComponentFunction(path, filename) || isCustomHook(path, filename))
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

const tryCatchTemplate = template.statements`var STORE_IDENTIFIER = HOOK_IDENTIFIER();
try {
	BODY
} finally {
	STORE_IDENTIFIER.f();
}`;

function wrapInTryFinally(
	t: typeof BabelTypes,
	path: NodePath<FunctionLike>,
	state: PluginPass
): FunctionLike {
	const stopTrackingIdentifier = path.scope.generateUidIdentifier("effect");

	const newFunction = t.cloneNode(path.node);
	newFunction.body = t.blockStatement(
		tryCatchTemplate({
			STORE_IDENTIFIER: stopTrackingIdentifier,
			HOOK_IDENTIFIER: get(state, getHookIdentifier)(),
			BODY: t.isBlockStatement(path.node.body)
				? path.node.body.body // TODO: Is it okay to elide the block statement here?
				: t.returnStatement(path.node.body),
		})
	);

	return newFunction;
}

function prependUseSignals<T extends FunctionLike>(
	t: typeof BabelTypes,
	path: NodePath<T>,
	state: PluginPass
): T {
	const newFunction = t.cloneNode(path.node);
	newFunction.body = t.blockStatement([
		t.expressionStatement(
			t.callExpression(get(state, getHookIdentifier)(), [])
		),
	]);
	if (t.isBlockStatement(path.node.body)) {
		// TODO: Is it okay to elide the block statement here?
		newFunction.body.body.push(...path.node.body.body);
	} else {
		newFunction.body.body.push(t.returnStatement(path.node.body));
	}

	return newFunction;
}

function transformFunction(
	t: typeof BabelTypes,
	options: PluginOptions,
	path: NodePath<FunctionLike>,
	filename: string | undefined,
	state: PluginPass
) {
	let newFunction: FunctionLike;
	if (isCustomHook(path, filename) || options.experimental?.noTryFinally) {
		// For custom hooks, we don't need to wrap the function body in a
		// try/finally block because later code in the function's render body could
		// read signals and we want to track and associate those signals with this
		// component. The try/finally in the component's body will stop tracking
		// signals for us instead.
		newFunction = prependUseSignals(t, path, state);
	} else {
		newFunction = wrapInTryFinally(t, path, state);
	}

	// Using replaceWith keeps the existing leading comments already so
	// we'll clear our cloned node's leading comments to ensure they
	// aren't duplicated in the output.
	newFunction.leadingComments = [];

	setData(path, alreadyTransformed, true);
	path.replaceWith(newFunction);
}

function createImportLazily(
	types: typeof BabelTypes,
	pass: PluginPass,
	path: NodePath<BabelTypes.Program>,
	importName: string,
	source: string
): () => BabelTypes.Identifier {
	return () => {
		if (!isModule(path)) {
			throw new Error(
				`Cannot import ${importName} outside of an ESM module file`
			);
		}

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
				(s.imported.type === "Identifier" && s.imported.name === importName) ||
				(s.imported.type === "StringLiteral" && s.imported.value === importName)
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
	};
}

export interface PluginOptions {
	/**
	 * Specify the mode to use:
	 * - `auto`: Automatically wrap all components that use signals.
	 * - `manual`: Only wrap components that are annotated with `@trackSignals` in a JSX comment.
	 * - `all`: Makes all components reactive to signals.
	 */
	mode?: "auto" | "manual" | "all";
	/** Specify a custom package to import the `useSignals` hook from. */
	importSource?: string;
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

export default function signalsTransform(
	{ types: t }: PluginArgs,
	options: PluginOptions
): PluginObj {
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
				},
			},

			ArrowFunctionExpression: {
				// TODO: Consider alternate implementation, where on enter of a function
				// expression, we run our own manual scan the AST to determine if the
				// function uses signals and is a component. This manual scan once upon
				// seeing a function would probably be faster than running an entire
				// babel pass with plugins on components twice.
				exit(path, state) {
					if (shouldTransform(path, this.filename, options)) {
						transformFunction(t, options, path, this.filename, state);
					}
				},
			},

			FunctionExpression: {
				exit(path, state) {
					if (shouldTransform(path, this.filename, options)) {
						transformFunction(t, options, path, this.filename, state);
					}
				},
			},

			FunctionDeclaration: {
				exit(path, state) {
					if (shouldTransform(path, this.filename, options)) {
						transformFunction(t, options, path, this.filename, state);
					}
				},
			},

			MemberExpression(path) {
				if (isValueMemberExpression(path)) {
					setOnFunctionScope(path, maybeUsesSignal, true);
				}
			},

			JSXElement(path) {
				setOnFunctionScope(path, containsJSX, true);
			},
			JSXFragment(path) {
				setOnFunctionScope(path, containsJSX, true);
			},
		},
	};
}
