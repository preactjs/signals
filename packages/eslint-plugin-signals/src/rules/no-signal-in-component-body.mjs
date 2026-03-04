/**
 * Disallow calling signal/computed/effect directly in a React component body.
 *
 * Calling signal(), computed(), or effect() during render creates a new
 * instance on every render, causing unnecessary allocations, stale values,
 * and — in the case of effect() — memory leaks. The hook equivalents
 * (useSignal, useComputed, useSignalEffect) manage the lifecycle correctly.
 *
 * Detection uses the PascalCase naming convention to identify React components,
 * which is the de-facto standard in the React ecosystem.
 */

import { getSignalsCallName } from "../utils/signals-scope.mjs";

const HOOK_MAP = {
	signal: "useSignal",
	computed: "useComputed",
	effect: "useSignalEffect",
};

const RAW_SIGNAL_NAMES = new Set(Object.keys(HOOK_MAP));

/**
 * Attempt to extract the declared name of a function node.
 * Returns null for anonymous functions that cannot be attributed to a name.
 */
function getFunctionName(node) {
	if (node.id?.name) return node.id.name;

	const parent = node.parent;
	if (
		parent?.type === "VariableDeclarator" &&
		parent.id.type === "Identifier"
	) {
		return parent.id.name;
	}

	return null;
}

/**
 * Returns true if the name follows the React component convention (PascalCase).
 */
function isPascalCase(name) {
	return typeof name === "string" && /^[A-Z]/.test(name);
}

/**
 * Check if an AST node contains a JSX element or fragment (non-recursive
 * into nested functions — only checks the function's own body).
 */
function containsJSX(node) {
	if (!node) return false;
	if (node.type === "JSXElement" || node.type === "JSXFragment") {
		return true;
	}
	// Don't recurse into nested functions
	if (
		node.type === "FunctionExpression" ||
		node.type === "ArrowFunctionExpression" ||
		node.type === "FunctionDeclaration"
	) {
		return false;
	}
	for (const key of Object.keys(node)) {
		if (key === "parent") continue;
		const child = node[key];
		if (child && typeof child === "object") {
			if (Array.isArray(child)) {
				for (const item of child) {
					if (item && typeof item.type === "string" && containsJSX(item))
						return true;
				}
			} else if (typeof child.type === "string") {
				if (containsJSX(child)) return true;
			}
		}
	}
	return false;
}

/**
 * Determine whether a function node is likely a React/Preact component.
 *
 * Two heuristics (either is sufficient):
 * 1. PascalCase name (the de-facto React convention)
 * 2. The function body contains JSX (catches unnamed or lowercase components)
 */
function isLikelyComponent(node) {
	if (isPascalCase(getFunctionName(node))) return true;
	return containsJSX(node.body);
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow calling `signal()`, `computed()`, or `effect()` directly in a component body; use `useSignal`, `useComputed`, or `useSignalEffect` instead",
			recommended: true,
		},
		messages: {
			preferHook:
				"Avoid calling {{fn}}() in a component body. Use {{hook}}() instead to avoid recreating the instance on every render.",
		},
		schema: [],
	},

	create(context) {
		const sourceCode = context.sourceCode ?? context.getSourceCode();

		/**
		 * Stack of booleans tracking whether each enclosing function is a
		 * component. Only the top entry matters for the current call site —
		 * a raw signal API call is only flagged when the immediately enclosing
		 * function is a component (i.e. the call is at the component's top level,
		 * not inside a nested callback).
		 */
		const fnStack = [];

		function onFunctionEnter(node) {
			fnStack.push(isLikelyComponent(node));
		}

		function onFunctionExit() {
			fnStack.pop();
		}

		return {
			FunctionDeclaration: onFunctionEnter,
			"FunctionDeclaration:exit": onFunctionExit,
			FunctionExpression: onFunctionEnter,
			"FunctionExpression:exit": onFunctionExit,
			ArrowFunctionExpression: onFunctionEnter,
			"ArrowFunctionExpression:exit": onFunctionExit,

			CallExpression(node) {
				if (!fnStack.length || !fnStack[fnStack.length - 1]) return;

				const name = getSignalsCallName(sourceCode, node, RAW_SIGNAL_NAMES);
				if (!name) return;

				context.report({
					node,
					messageId: "preferHook",
					data: { fn: name, hook: HOOK_MAP[name] },
				});
			},
		};
	},
};

export default rule;
