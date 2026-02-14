/**
 * Warn when reading signal `.value` after an `await` expression.
 *
 * Signal dependency tracking is synchronous. After an `await`, the tracking
 * context is lost and `.value` reads won't be tracked as dependencies.
 * Writing to `.value` after await is fine — only reads are flagged.
 */

import { isKnownSignal } from "../utils/signals-scope.mjs";

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Warn when accessing signal `.value` after an `await` expression, which breaks reactive tracking",
			recommended: true,
		},
		messages: {
			valueAfterAwait:
				"Reading `.value` after an `await` will not be tracked by the reactive system. Read all signal values before the first `await`, use `.peek()`, or use `untracked()` explicitly if this is intentional.",
		},
		schema: [],
	},

	create(context) {
		const sourceCode = context.sourceCode ?? context.getSourceCode();
		const scopeStack = [];

		/** True when the MemberExpression is the target of an assignment or update. */
		function isWriteTarget(node) {
			const parent = node.parent;
			if (!parent) return false;
			if (parent.type === "AssignmentExpression" && parent.left === node)
				return true;
			if (parent.type === "UpdateExpression" && parent.argument === node)
				return true;
			return false;
		}

		function enterFunction(node) {
			scopeStack.push({ isAsync: node.async === true, hasSeenAwait: false });
		}

		function exitFunction() {
			scopeStack.pop();
		}

		function currentScope() {
			return scopeStack.length > 0 ? scopeStack[scopeStack.length - 1] : null;
		}

		/**
		 * Best-effort check: is the `.value` receiver a known signal?
		 * Unresolvable identifiers (globals, params without annotations) still
		 * warn — `.value` after `await` is suspicious regardless.
		 */
		function isLikelySignal(node) {
			if (node.type !== "Identifier") return true;
			if (isKnownSignal(sourceCode, node)) return true;

			let scope;
			try {
				scope = sourceCode.getScope(node);
			} catch {
				return true;
			}

			while (scope) {
				const variable = scope.variables.find(v => v.name === node.name);
				if (variable) {
					for (const def of variable.defs) {
						if (
							def.type === "Variable" &&
							def.node.type === "VariableDeclarator"
						) {
							return false; // has a local init we checked — it's not a signal
						}
					}
					return true;
				}
				scope = scope.upper;
			}
			return true;
		}

		return {
			FunctionDeclaration(node) {
				enterFunction(node);
			},
			"FunctionDeclaration:exit"() {
				exitFunction();
			},
			FunctionExpression(node) {
				enterFunction(node);
			},
			"FunctionExpression:exit"() {
				exitFunction();
			},
			ArrowFunctionExpression(node) {
				enterFunction(node);
			},
			"ArrowFunctionExpression:exit"() {
				exitFunction();
			},

			AwaitExpression() {
				const scope = currentScope();
				if (scope?.isAsync) scope.hasSeenAwait = true;
			},

			ForOfStatement(node) {
				if (node.await) {
					const scope = currentScope();
					if (scope?.isAsync) scope.hasSeenAwait = true;
				}
			},

			MemberExpression(node) {
				const scope = currentScope();
				if (!scope?.isAsync || !scope.hasSeenAwait) return;

				if (
					node.property.type === "Identifier" &&
					node.property.name === "value" &&
					!node.computed &&
					!isWriteTarget(node) &&
					isLikelySignal(node.object)
				) {
					context.report({ node, messageId: "valueAfterAwait" });
				}
			},
		};
	},
};

export default rule;
