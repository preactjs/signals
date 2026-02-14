/**
 * Warn when a signal object is used in a boolean/truthiness context.
 *
 * Signal objects are always truthy — the developer almost certainly meant
 * to check `.value` instead. Signals are identified by tracing declarations
 * to signal-creator calls or Signal/ReadonlySignal type annotations.
 */

import {
	isKnownSignal,
	isSignalByTypeChecker,
} from "../utils/signals-scope.mjs";

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Warn when a signal object is used in a boolean/truthiness context instead of its `.value`",
			recommended: true,
		},
		messages: {
			noSignalTruthiness:
				"A Signal object is always truthy. Did you mean to use `{{ name }}.value` instead of `{{ name }}`?",
			noSignalTruthinessGeneric:
				"A Signal object is always truthy. Did you mean to use `.value` to read the signal's current value?",
		},
		schema: [],
	},

	create(context) {
		const sourceCode = context.sourceCode ?? context.getSourceCode();
		const parserServices = context.parserServices ?? sourceCode?.parserServices;

		function isSignal(node) {
			return (
				isKnownSignal(sourceCode, node) ||
				isSignalByTypeChecker(parserServices, node)
			);
		}

		function reportNode(node) {
			if (node.type === "Identifier") {
				context.report({
					node,
					messageId: "noSignalTruthiness",
					data: { name: node.name },
				});
			} else if (
				node.type === "MemberExpression" &&
				!node.computed &&
				node.property.type === "Identifier"
			) {
				context.report({
					node,
					messageId: "noSignalTruthiness",
					data: { name: sourceCode.getText(node) },
				});
			} else {
				context.report({ node, messageId: "noSignalTruthinessGeneric" });
			}
		}

		function checkTest(node) {
			if (node.test && isSignal(node.test)) reportNode(node.test);
		}

		return {
			IfStatement: checkTest,
			WhileStatement: checkTest,
			DoWhileStatement: checkTest,
			ForStatement: checkTest,
			ConditionalExpression: checkTest,

			LogicalExpression(node) {
				if (isSignal(node.left)) reportNode(node.left);
			},

			UnaryExpression(node) {
				if (node.operator === "!" && isSignal(node.argument)) {
					reportNode(node.argument);
				}
			},

			CallExpression(node) {
				if (
					node.callee.type === "Identifier" &&
					node.callee.name === "Boolean" &&
					node.arguments.length > 0 &&
					isSignal(node.arguments[0])
				) {
					reportNode(node.arguments[0]);
				}
			},
		};
	},
};

export default rule;
