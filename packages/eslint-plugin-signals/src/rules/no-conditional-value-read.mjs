/**
 * Warn when signal `.value` is read conditionally inside a reactive scope
 * (effect, computed, useSignalEffect, useComputed), where the guarding
 * condition does NOT itself read `.value` — meaning no signal is tracked
 * as a dependency and the reactive scope may never re-run.
 *
 * When a guard uses `.value` (e.g. `if (!sig.value) return`), that signal
 * IS tracked, so the effect will re-run when it changes and the downstream
 * `.value` reads get a chance to execute. When the guard uses `.peek()` or
 * a plain (non-signal) variable, nothing is tracked and the entire effect
 * may silently stop updating.
 *
 * @see https://github.com/preactjs/signals/issues/621
 */

import {
	ALL_REACTIVE_CREATORS,
	getSignalsCallName,
	isSignalsImport,
} from "../utils/signals-scope.mjs";

const UNTRACKED_NAMES = new Set(["untracked"]);

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Warn when signal `.value` is read conditionally inside a reactive scope behind a non-reactive guard, which may cause missed dependency tracking",
			recommended: true,
		},
		messages: {
			conditionalValueRead:
				"Reading `.value` here may not execute on every invocation of this {{ name }}() callback " +
				"because the guarding condition does not read any signal `.value`. " +
				"If the guard never changes reactively, this signal won't be tracked as a dependency. " +
				"Move this `.value` read before any conditional returns or use `.value` instead of `.peek()` in the guard.",
		},
		schema: [],
	},

	create(context) {
		const sourceCode = context.sourceCode ?? context.getSourceCode();
		const reactiveStack = [];

		/**
		 * If `fnNode` is the first argument of a reactive creator call
		 * (effect, computed, etc.), return { fnNode, name }.
		 */
		function getReactiveCallInfo(fnNode) {
			const parent = fnNode.parent;
			if (!parent || parent.type !== "CallExpression") return null;
			if (parent.arguments[0] !== fnNode) return null;
			const name = getSignalsCallName(
				sourceCode,
				parent,
				ALL_REACTIVE_CREATORS
			);
			if (!name) return null;
			return { fnNode, name };
		}

		function enterFunction(node) {
			const info = getReactiveCallInfo(node);
			if (info) reactiveStack.push(info);
		}

		function exitFunction(node) {
			if (
				reactiveStack.length > 0 &&
				reactiveStack[reactiveStack.length - 1].fnNode === node
			) {
				reactiveStack.pop();
			}
		}

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

		/**
		 * Check if a CallExpression is a call to `untracked()` from a
		 * signals package. Reads inside untracked are explicitly
		 * non-reactive, like `.peek()`.
		 */
		function isUntrackedCall(node) {
			if (node.type !== "CallExpression") return false;
			return isSignalsImport(sourceCode, node.callee, UNTRACKED_NAMES);
		}

		/**
		 * Recursively check whether an expression contains a `.value`
		 * member access (i.e. a reactive read). Stops at function
		 * boundaries and skips `untracked()` calls (those reads are
		 * explicitly non-reactive, like `.peek()`).
		 */
		function containsValueRead(node) {
			if (!node) return false;
			// Skip untracked() calls — reads inside are non-reactive
			if (isUntrackedCall(node)) return false;
			if (
				node.type === "MemberExpression" &&
				!node.computed &&
				node.property.type === "Identifier" &&
				node.property.name === "value"
			) {
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
							if (
								item &&
								typeof item.type === "string" &&
								containsValueRead(item)
							) {
								return true;
							}
						}
					} else if (typeof child.type === "string") {
						if (containsValueRead(child)) return true;
					}
				}
			}
			return false;
		}

		/**
		 * Check if a statement may cause the function to exit
		 * (contains a return or throw at the statement level,
		 * not inside a nested function).
		 */
		function statementMayExit(stmt) {
			if (stmt.type === "ReturnStatement" || stmt.type === "ThrowStatement") {
				return true;
			}
			if (stmt.type === "IfStatement") {
				return (
					blockMayExit(stmt.consequent) ||
					(stmt.alternate != null && blockMayExit(stmt.alternate))
				);
			}
			if (stmt.type === "SwitchStatement") {
				return stmt.cases.some(c =>
					c.consequent.some(s => statementMayExit(s))
				);
			}
			// Don't recurse into for/while/do bodies or nested functions
			return false;
		}

		function blockMayExit(node) {
			if (node.type === "BlockStatement") {
				return node.body.some(s => statementMayExit(s));
			}
			return statementMayExit(node);
		}

		/**
		 * Check if a statement may exit AND its guard does NOT contain
		 * a `.value` read (i.e. it's a non-reactive guard).
		 */
		function statementMayExitWithoutValueRead(stmt) {
			if (stmt.type === "ReturnStatement" || stmt.type === "ThrowStatement") {
				return true;
			}
			if (stmt.type === "IfStatement") {
				const guardHasValue = containsValueRead(stmt.test);
				if (guardHasValue) return false;
				return (
					blockMayExit(stmt.consequent) ||
					(stmt.alternate != null && blockMayExit(stmt.alternate))
				);
			}
			if (stmt.type === "SwitchStatement") {
				const guardHasValue = containsValueRead(stmt.discriminant);
				if (guardHasValue) return false;
				return stmt.cases.some(c =>
					c.consequent.some(s => statementMayExit(s))
				);
			}
			return false;
		}

		/**
		 * Find the direct child statement of `blockStmt` that contains `node`.
		 */
		function getBodyLevelStatement(node, blockStmt) {
			let current = node;
			while (current.parent && current.parent !== blockStmt) {
				current = current.parent;
			}
			return current.parent === blockStmt ? current : null;
		}

		/**
		 * Check if a `.value` read is conditionally reachable within its
		 * reactive scope AND the guarding condition is non-reactive
		 * (does not itself contain a `.value` read).
		 */
		function isConditionallyReachable(valueNode, reactiveInfo) {
			const fnNode = reactiveInfo.fnNode;
			const body = fnNode.body;

			if (!body || body.type !== "BlockStatement") return false;

			let current = valueNode;
			while (current && current !== fnNode) {
				const parent = current.parent;
				if (!parent || parent === fnNode) break;

				if (
					parent.type === "FunctionExpression" ||
					parent.type === "ArrowFunctionExpression" ||
					parent.type === "FunctionDeclaration"
				) {
					return false;
				}

				if (parent.type === "IfStatement") {
					if (current === parent.consequent || current === parent.alternate) {
						if (!containsValueRead(parent.test)) return true;
					}
				}
				if (parent.type === "ConditionalExpression") {
					if (current === parent.consequent || current === parent.alternate) {
						if (!containsValueRead(parent.test)) return true;
					}
				}
				if (parent.type === "LogicalExpression") {
					if (current === parent.right) {
						if (!containsValueRead(parent.left)) return true;
					}
				}
				if (parent.type === "SwitchCase") {
					const switchStmt = parent.parent;
					if (switchStmt && !containsValueRead(switchStmt.discriminant)) {
						return true;
					}
				}

				current = parent;
			}

			const bodyLevelStmt = getBodyLevelStatement(valueNode, body);
			if (bodyLevelStmt) {
				for (const stmt of body.body) {
					if (stmt === bodyLevelStmt) break;
					if (statementMayExitWithoutValueRead(stmt)) return true;
				}
			}

			return false;
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

			MemberExpression(node) {
				if (reactiveStack.length === 0) return;
				if (node.computed) return;
				if (
					node.property.type !== "Identifier" ||
					node.property.name !== "value"
				) {
					return;
				}
				if (isWriteTarget(node)) return;

				const reactiveInfo = reactiveStack[reactiveStack.length - 1];
				if (isConditionallyReachable(node, reactiveInfo)) {
					context.report({
						node,
						messageId: "conditionalValueRead",
						data: { name: reactiveInfo.name },
					});
				}
			},
		};
	},
};

export default rule;
