/**
 * Disallow writing to signal `.value` inside computed()/useComputed() callbacks.
 *
 * Computed signals must be pure derivations. The callee is verified via scope
 * analysis to confirm it is `computed` or `useComputed` from a signals package.
 */

import {
	COMPUTED_CREATORS,
	getSignalsCallName,
} from "../utils/signals-scope.mjs";

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow writing to signal `.value` inside `computed()` or `useComputed()` callbacks",
			recommended: true,
		},
		messages: {
			noWriteInComputed:
				"Do not write to a signal's `.value` inside a {{ fn }}() callback, computed signals must be pure derivations without side effects.",
		},
		schema: [],
	},

	create(context) {
		const sourceCode = context.sourceCode ?? context.getSourceCode();
		const computedStack = [];

		function getEnclosingComputedName(fnNode) {
			const parent = fnNode.parent;
			if (!parent || parent.type !== "CallExpression") return null;
			if (parent.arguments[0] !== fnNode) return null;
			return getSignalsCallName(sourceCode, parent, COMPUTED_CREATORS);
		}

		function enterFunction(node) {
			const name = getEnclosingComputedName(node);
			if (name) computedStack.push(name);
		}

		function exitFunction(node) {
			if (getEnclosingComputedName(node)) computedStack.pop();
		}

		return {
			FunctionExpression(node) {
				enterFunction(node);
			},
			"FunctionExpression:exit"(node) {
				exitFunction(node);
			},
			ArrowFunctionExpression(node) {
				enterFunction(node);
			},
			"ArrowFunctionExpression:exit"(node) {
				exitFunction(node);
			},

			AssignmentExpression(node) {
				if (computedStack.length === 0) return;

				const left = node.left;
				if (
					left.type === "MemberExpression" &&
					left.property.type === "Identifier" &&
					left.property.name === "value" &&
					!left.computed
				) {
					context.report({
						node,
						messageId: "noWriteInComputed",
						data: { fn: computedStack[computedStack.length - 1] },
					});
				}
			},
		};
	},
};

export default rule;
