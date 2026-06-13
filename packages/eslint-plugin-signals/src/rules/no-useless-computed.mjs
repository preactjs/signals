/**
 * Warn when a computed/useComputed callback only returns another signal's
 * `.value` unchanged.
 *
 * Such a computed adds an extra graph node and subscription without deriving
 * any new value. Real derivations like `sig.value * 2`, `!sig.value`, or
 * `sig.value.foo` are intentionally allowed.
 */

import {
	COMPUTED_CREATORS,
	getSignalsCallName,
	isKnownSignal,
	isSignalByTypeChecker,
} from "../utils/signals-scope.mjs";

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Disallow computed/useComputed callbacks that only return another signal's `.value` without transformation",
			recommended: true,
		},
		messages: {
			uselessComputed:
				"This {{ fn }}() only returns `{{ name }}.value` without transforming it. Use the signal `{{ name }}` directly instead.",
		},
		schema: [],
	},

	create(context) {
		const sourceCode = context.sourceCode ?? context.getSourceCode();
		const parserServices = context.parserServices ?? sourceCode?.parserServices;

		function getSoleReturnedExpression(fnNode) {
			if (fnNode.async || fnNode.generator) return null;
			if (fnNode.body.type !== "BlockStatement") return fnNode.body;
			if (fnNode.body.body.length !== 1) return null;

			const stmt = fnNode.body.body[0];
			if (stmt.type !== "ReturnStatement" || !stmt.argument) return null;
			return stmt.argument;
		}

		function unwrapChainExpression(node) {
			return node.type === "ChainExpression" ? node.expression : node;
		}

		function isPlainPropertyChain(node) {
			let current = node;
			while (current.type === "MemberExpression") {
				if (
					current.computed ||
					current.property.type !== "Identifier" ||
					current.property.name === "value"
				) {
					return false;
				}
				current = unwrapChainExpression(current.object);
			}
			return current.type === "Identifier";
		}

		function isSignalObject(node) {
			const unwrapped = unwrapChainExpression(node);
			if (unwrapped.type === "Identifier") {
				return (
					isKnownSignal(sourceCode, unwrapped) ||
					isSignalByTypeChecker(parserServices, unwrapped)
				);
			}
			if (
				unwrapped.type === "MemberExpression" &&
				isPlainPropertyChain(unwrapped)
			) {
				return isSignalByTypeChecker(parserServices, unwrapped);
			}
			return false;
		}

		return {
			CallExpression(node) {
				const fnName = getSignalsCallName(sourceCode, node, COMPUTED_CREATORS);
				if (!fnName) return;
				if (node.arguments.length > 1) return;

				const cb = node.arguments[0];
				if (
					!cb ||
					(cb.type !== "ArrowFunctionExpression" &&
						cb.type !== "FunctionExpression")
				) {
					return;
				}

				let returned = getSoleReturnedExpression(cb);
				if (!returned) return;
				returned = unwrapChainExpression(returned);
				if (
					returned.type !== "MemberExpression" ||
					returned.computed ||
					returned.property.type !== "Identifier" ||
					returned.property.name !== "value"
				) {
					return;
				}

				if (!isSignalObject(returned.object)) return;

				context.report({
					node,
					messageId: "uselessComputed",
					data: { fn: fnName, name: sourceCode.getText(returned.object) },
				});
			},
		};
	},
};

export default rule;
