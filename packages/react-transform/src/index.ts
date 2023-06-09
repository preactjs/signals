import {
	types as BabelTypes,
	template as BabelTemplate,
	PluginObj,
	PluginPass,
	NodePath,
	template,
} from "@babel/core";
import { isModule, addNamed, addNamespace } from "@babel/helper-module-imports";

interface PluginArgs {
	types: typeof BabelTypes;
	template: typeof BabelTemplate;
}

const importSource = "@preact/signals-react/runtime";
const importName = "useSignals";
const getHookIdentifier = "getHookIdentifier";

const get = (pass: PluginPass, name: any) =>
	pass.get(`@preact/signals-react-transform/${name}`);
const set = (pass: PluginPass, name: string, v: any) =>
	pass.set(`@preact/signals-react-transform/${name}`, v);

type FunctionLikeNodePath =
	| NodePath<BabelTypes.ArrowFunctionExpression>
	| NodePath<BabelTypes.FunctionDeclaration>;

function isReactComponent(path: FunctionLikeNodePath): boolean {
	if (path.node.type === "ArrowFunctionExpression") {
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

const tryCatchTemplate = template`var STOP_TRACKING_IDENTIFIER = HOOK_IDENTIFIER();
try {
	BODY
} finally {
	STOP_TRACKING_IDENTIFIER();
}`;

export default function signalsTransform({ types: t }: PluginArgs): PluginObj {
	return {
		name: "@preact/signals-transform",
		visitor: {
			Program: {
				enter(path, state) {
					// TODO: Comment why we do this.
					set(
						state,
						getHookIdentifier,
						createImportLazily(t, state, path, importName, importSource)
					);
				},
			},
			ArrowFunctionExpression(path, state) {
				if (isReactComponent(path)) {
					const stopTrackingIdentifier =
						path.scope.generateUidIdentifier("stopTracking");

					// TODO: Should I use replaceWith() instead?
					path.node.body = t.blockStatement(
						tryCatchTemplate({
							STOP_TRACKING_IDENTIFIER: stopTrackingIdentifier,
							HOOK_IDENTIFIER: get(state, getHookIdentifier)(),
							BODY: t.isBlockStatement(path.node.body)
								? path.node.body.body // TODO: Is it okay to elide the block statement here?
								: t.returnStatement(path.node.body),
						}) as BabelTypes.BlockStatement[]
					);
				}
			},

			FunctionDeclaration(path, state) {
				if (isReactComponent(path)) {
					const stopTrackingIdentifier =
						path.scope.generateUidIdentifier("stopTracking");

					// TODO: Should I use replaceWith() instead?
					path.node.body = t.blockStatement(
						tryCatchTemplate({
							STOP_TRACKING_IDENTIFIER: stopTrackingIdentifier,
							HOOK_IDENTIFIER: get(state, getHookIdentifier)(),
							BODY: path.node.body.body, // TODO: Is it okay to elide the block statement here?,
						}) as BabelTypes.BlockStatement[]
					);
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
