import {
	types as BabelTypes,
	template as BabelTemplate,
	PluginObj,
	PluginPass,
	NodePath,
	template,
} from "@babel/core";
import { isModule, addNamed, addNamespace } from "@babel/helper-module-imports";

// TODO:
// - If function has JSX & is top-level, opt-in
// - Add debug log option
// - how to trigger rerenders on attributes change if transform never sees `.value`?
// - Have useSignals always end and restart the current tracking effect. it's fine :)

interface PluginArgs {
	types: typeof BabelTypes;
	template: typeof BabelTemplate;
}

const optOutCommentIdentifier = "@noTrackSignals";
const optInCommentIdentifier = "@trackSignals";
const dataNamespace = "@preact/signals-react-transform";
const importSource = "@preact/signals-react/runtime";
const importName = "useSignals";
const getHookIdentifier = "getHookIdentifier";
const maybeUsesSignal = "maybeUsesSignal";
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

type FunctionLikeNodePath =
	| NodePath<BabelTypes.ArrowFunctionExpression>
	| NodePath<BabelTypes.FunctionExpression>
	| NodePath<BabelTypes.FunctionDeclaration>;

function isReactComponent(path: FunctionLikeNodePath): boolean {
	if (
		path.node.type === "ArrowFunctionExpression" ||
		path.node.type === "FunctionExpression"
	) {
		return (
			path.parentPath.node.type === "VariableDeclarator" &&
			path.parentPath.node.id.type === "Identifier" &&
			path.parentPath.node.id.name.match(/^[A-Z]/) !== null
		);
	} else if (path.node.type === "FunctionDeclaration") {
		return path.node.id?.name?.match(/^[A-Z]/) !== null;
	} else {
		return false;
	}
}

function hasLeadingComment(
	path: NodePath,
	comment: string
): path is NodePath & { node: { leadingComments: any[] } } {
	return (
		path.node.leadingComments?.some(c => c.value.includes(comment)) ?? false
	);
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
			return (
				hasLeadingOptInComment(path) ||
				isOptedIntoSignalTracking(path.parentPath)
			);
		case "ExportDefaultDeclaration":
		case "ExportNamedDeclaration":
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
			return (
				hasLeadingOptOutComment(path) ||
				isOptedOutOfSignalTracking(path.parentPath)
			);
		case "ExportDefaultDeclaration":
		case "ExportNamedDeclaration":
			return hasLeadingOptOutComment(path);
		default:
			return false;
	}
}

function shouldTransform(
	path: FunctionLikeNodePath,
	options: PluginOptions
): boolean {
	// Opt-out always takes precedence
	if (isOptedOutOfSignalTracking(path)) return false;

	if (options.mode === "auto") {
		return (
			(isReactComponent(path) &&
				getData(path.scope, maybeUsesSignal) === true) ||
			isOptedIntoSignalTracking(path)
		);
	} else if (options.mode === "manual") {
		return isOptedIntoSignalTracking(path);
	} else {
		throw new Error(`Invalid mode: ${options.mode}`);
	}
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

const tryCatchTemplate = template.statements`var STOP_TRACKING_IDENTIFIER = HOOK_IDENTIFIER();
try {
	BODY
} finally {
	STOP_TRACKING_IDENTIFIER();
}`;

export interface PluginOptions {
	/**
	 * Specify the mode to use:
	 * - `auto`: Automatically wrap all components that use signals.
	 * - `manual`: Only wrap components that are annotated with `@trackSignals` in a JSX comment.
	 */
	mode: "auto" | "manual";
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
						createImportLazily(t, state, path, importName, importSource)
					);
				},
			},

			ArrowFunctionExpression: {
				exit(path, state) {
					if (
						getData(path, alreadyTransformed) !== true &&
						shouldTransform(path, options)
					) {
						const stopTrackingIdentifier =
							path.scope.generateUidIdentifier("stopTracking");

						const newFunction = t.cloneNode(path.node);
						newFunction.body = t.blockStatement(
							tryCatchTemplate({
								STOP_TRACKING_IDENTIFIER: stopTrackingIdentifier,
								HOOK_IDENTIFIER: get(state, getHookIdentifier)(),
								BODY: t.isBlockStatement(path.node.body)
									? path.node.body.body // TODO: Is it okay to elide the block statement here?
									: t.returnStatement(path.node.body),
							})
						);

						// Using replaceWith keeps the existing leading comments already so
						// we'll clear our cloned node's leading comments to ensure they
						// aren't duplicated in the output.
						newFunction.leadingComments = [];

						setData(path, alreadyTransformed, true);
						path.replaceWith(newFunction);
					}
				},
			},

			FunctionExpression: {
				exit(path, state) {
					if (
						getData(path, alreadyTransformed) !== true &&
						shouldTransform(path, options)
					) {
						const stopTrackingIdentifier =
							path.scope.generateUidIdentifier("stopTracking");

						const newFunction = t.cloneNode(path.node);
						newFunction.body = t.blockStatement(
							tryCatchTemplate({
								STOP_TRACKING_IDENTIFIER: stopTrackingIdentifier,
								HOOK_IDENTIFIER: get(state, getHookIdentifier)(),
								BODY: path.node.body.body, // TODO: Is it okay to elide the block statement here?
							})
						);

						// Using replaceWith keeps the existing leading comments already so
						// we'll clear our cloned node's leading comments to ensure they
						// aren't duplicated in the output.
						newFunction.leadingComments = [];

						setData(path, alreadyTransformed, true);
						path.replaceWith(newFunction);
					}
				},
			},

			FunctionDeclaration: {
				exit(path, state) {
					if (
						getData(path, alreadyTransformed) !== true &&
						shouldTransform(path, options)
					) {
						const stopTrackingIdentifier =
							path.scope.generateUidIdentifier("stopTracking");

						const newFunction = t.cloneNode(path.node);
						newFunction.body = t.blockStatement(
							tryCatchTemplate({
								STOP_TRACKING_IDENTIFIER: stopTrackingIdentifier,
								HOOK_IDENTIFIER: get(state, getHookIdentifier)(),
								BODY: path.node.body.body, // TODO: Is it okay to elide the block statement here?,
							})
						);

						// Using replaceWith keeps the existing leading comments already so
						// we'll clear our cloned node's leading comments to ensure they
						// aren't duplicated in the output.
						newFunction.leadingComments = [];

						setData(path, alreadyTransformed, true);
						path.replaceWith(newFunction);
					}
				},
			},

			MemberExpression(path) {
				if (isValueMemberExpression(path)) {
					// TODO: Uhhh what if a hook accesses a signal in render that isn't used in the render body but... Hmmmm...
					const functionScope = path.scope.getFunctionParent();
					if (functionScope) {
						setData(functionScope, maybeUsesSignal, true);
					}
				}
			},
		},
	};
}

function createImportLazily(
	types: typeof BabelTypes,
	pass: PluginPass,
	path: NodePath<BabelTypes.Program>,
	importName: string,
	source: string
) {
	return () => {
		if (isModule(path)) {
			let reference = get(pass, `imports/${importName}`);
			if (reference) return types.cloneNode(reference);
			reference = addNamed(path, importName, source, {
				importedInterop: "uncompiled",
				importPosition: "after",
			});
			set(pass, `imports/${importName}`, reference);
			return reference;
		} else {
			let reference = get(pass, `requires/${source}`);
			if (reference) {
				reference = types.cloneNode(reference);
			} else {
				reference = addNamespace(path, source, {
					importedInterop: "uncompiled",
				});
				set(pass, `requires/${source}`, reference);
			}
			return types.memberExpression(reference, types.identifier(importName));
		}
	};
}
