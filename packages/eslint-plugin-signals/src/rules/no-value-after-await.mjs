/**
 * Warn when reading signal `.value` after an `await` expression.
 *
 * Signal dependency tracking is synchronous. After an `await`, the tracking
 * context is lost and `.value` reads won't be tracked as dependencies.
 * Writing to `.value` after await is fine — only reads are flagged.
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
		const parserServices = context.parserServices ?? sourceCode?.parserServices;
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
		 * Check whether the `.value` receiver is a signal.
		 *
		 * Detection strategy (in order):
		 * 1. Scope analysis — traces to signal creator calls or Signal type annotations.
		 * 2. TypeScript type checker — catches member-expression signals (obj.sig).
		 * 3. For identifiers that resolve to a local variable or parameter with a
		 *    definition, assume NOT a signal (the user declared it, and it didn't
		 *    match steps 1-2).
		 * 4. For completely unresolvable identifiers (globals with no definition),
		 *    assume it could be a signal and flag conservatively.
		 */
		function isLikelySignal(node) {
			// Scope analysis: definitive yes
			if (isKnownSignal(sourceCode, node)) return true;

			// Type checker: definitive yes (handles member expressions too)
			if (isSignalByTypeChecker(parserServices, node)) return true;

			// For non-identifiers (member expressions, call results, etc.)
			// without type checker info we can't tell — skip to avoid noise.
			if (node.type !== "Identifier") return false;

			// Walk scope chain to find the variable definition
			let scope;
			try {
				scope = sourceCode.getScope(node);
			} catch {
				return false;
			}

			while (scope) {
				const variable = scope.variables.find(v => v.name === node.name);
				if (variable) {
					// Variable has definitions (local var, param, import, etc.)
					// — it didn't match scope analysis or type checker, so it's
					// not a signal.
					if (variable.defs.length > 0) return false;

					// Implicit global (no defs) — could be anything, skip.
					return false;
				}
				scope = scope.upper;
			}
			// Completely unresolved — skip to avoid false positives on
			// DOM elements, class instances, etc.
			return false;
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
