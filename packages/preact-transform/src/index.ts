import { types as BabelTypes, PluginObj, NodePath } from "@babel/core";

interface PluginArgs {
	types: typeof BabelTypes;
}

export interface PluginOptions {
	enabled?: boolean;
}

/**
 * Simple "best effort" to get the base name of a file path. Not fool proof but
 * works in browsers and servers. Good enough for our purposes.
 */
function basename(filename: string | undefined): string | undefined {
	return filename?.split(/[\\/]/).pop();
}

function isSignalCall(path: NodePath<BabelTypes.CallExpression>): boolean {
	const callee = path.get("callee");

	// Check direct calls to APIs that accept debug names.
	if (callee.isIdentifier()) {
		const name = callee.node.name;
		return (
			name === "signal" ||
			name === "computed" ||
			name === "effect" ||
			name === "useSignal" ||
			name === "useComputed" ||
			name === "useSignalEffect"
		);
	}

	return false;
}

function getStaticName(node: BabelTypes.Node, computed = false): string | null {
	if (!computed && node.type === "Identifier") {
		return node.name;
	} else if (!computed && node.type === "PrivateName") {
		return `#${node.id.name}`;
	} else if (node.type === "StringLiteral" || node.type === "NumericLiteral") {
		return String(node.value);
	}

	return null;
}

function hasComputedKey(node: BabelTypes.Node): boolean {
	return "computed" in node && node.computed === true;
}

function getAssignmentName(
	node: BabelTypes.AssignmentExpression["left"]
): string | null {
	if (node.type === "Identifier") {
		return node.name;
	} else if (node.type === "MemberExpression") {
		return getStaticName(node.property, node.computed);
	}

	return null;
}

function getFunctionExpressionName(path: NodePath): string | null {
	const parentPath = path.parentPath;
	if (!parentPath) return null;

	if (parentPath.isVariableDeclarator()) {
		return parentPath.node.id.type === "Identifier"
			? parentPath.node.id.name
			: null;
	} else if (parentPath.isAssignmentExpression()) {
		return getAssignmentName(parentPath.node.left);
	} else if (
		parentPath.isObjectProperty() ||
		parentPath.isClassProperty() ||
		parentPath.isClassPrivateProperty()
	) {
		return getStaticName(parentPath.node.key, hasComputedKey(parentPath.node));
	}

	return null;
}

function getSignalNameFromContext(
	path: NodePath<BabelTypes.CallExpression>
): string | null {
	let currentPath: NodePath | null = path.parentPath;
	while (currentPath) {
		if (
			currentPath.isArrowFunctionExpression() ||
			(currentPath.isFunctionExpression() && !currentPath.node.id)
		) {
			const name = getFunctionExpressionName(currentPath);
			if (name) return name;
			break;
		} else if (
			currentPath.isVariableDeclarator() &&
			currentPath.node.id.type === "Identifier"
		) {
			return currentPath.node.id.name;
		} else if (currentPath.isAssignmentExpression()) {
			const name = getAssignmentName(currentPath.node.left);
			if (name) return name;
			break;
		} else if (currentPath.isObjectProperty()) {
			const name = getStaticName(
				currentPath.node.key,
				hasComputedKey(currentPath.node)
			);
			if (name) return name;
			break;
		} else if (
			currentPath.isClassProperty() ||
			currentPath.isClassPrivateProperty()
		) {
			const name = getStaticName(
				currentPath.node.key,
				hasComputedKey(currentPath.node)
			);
			if (name) return name;
			break;
		} else if (
			(currentPath.isFunctionDeclaration() ||
				currentPath.isFunctionExpression()) &&
			currentPath.node.id
		) {
			return currentPath.node.id.name;
		} else if (
			currentPath.isObjectMethod() ||
			currentPath.isClassMethod() ||
			currentPath.isClassPrivateMethod()
		) {
			const name = getStaticName(
				currentPath.node.key,
				hasComputedKey(currentPath.node)
			);
			if (name) return name;
			break;
		}
		currentPath = currentPath.parentPath;
	}

	return null;
}

function getSignalName(
	path: NodePath<BabelTypes.CallExpression>,
	filename: string | undefined
): string | null {
	const contextName = getSignalNameFromContext(path);
	const baseName = basename(filename);
	const lineNumber = path.node.loc?.start.line;

	if (baseName && lineNumber) {
		return contextName
			? `${contextName} (${baseName}:${lineNumber})`
			: `${baseName}:${lineNumber}`;
	}

	return contextName;
}

function shouldSkipNameInjection(
	t: typeof BabelTypes,
	args: NodePath<
		| BabelTypes.Expression
		| BabelTypes.SpreadElement
		| BabelTypes.JSXNamespacedName
		| BabelTypes.ArgumentPlaceholder
	>[]
): boolean {
	if (args.length < 2) return false;

	const optionsArg = args[1];
	if (!optionsArg.isObjectExpression()) {
		// Non-literal options cannot be safely extended without changing semantics.
		return true;
	}

	return optionsArg.node.properties.some(prop => {
		if (t.isSpreadElement(prop)) return true;
		if (!t.isObjectProperty(prop)) return false;

		const key = getStaticName(prop.key, prop.computed);
		return key === "name" || (key === null && prop.computed);
	});
}

function injectSignalName(
	t: typeof BabelTypes,
	path: NodePath<BabelTypes.CallExpression>,
	nameValue: string
): void {
	const args = path.get("arguments");
	const name = t.stringLiteral(nameValue);

	if (args.length === 0) {
		// No arguments, add both value and options
		const nameOption = t.objectExpression([
			t.objectProperty(t.identifier("name"), name),
		]);
		path.node.arguments.push(t.identifier("undefined"), nameOption);
	} else if (args.length === 1) {
		// One argument (value), add options object
		const nameOption = t.objectExpression([
			t.objectProperty(t.identifier("name"), name),
		]);
		path.node.arguments.push(nameOption);
	} else if (args.length >= 2) {
		// Two or more arguments, modify existing literal options
		const optionsArg = args[1];
		if (optionsArg.isObjectExpression()) {
			optionsArg.node.properties.push(
				t.objectProperty(t.identifier("name"), name)
			);
		}
	}
}

export default function signalsTransform(
	{ types: t }: PluginArgs,
	options: PluginOptions
): PluginObj {
	const isEnabled = options.enabled !== false;
	return {
		name: "@preact/signals-transform",
		visitor: {
			CallExpression(path, state) {
				// Handle signal naming
				if (isEnabled && isSignalCall(path)) {
					const args = path.get("arguments");

					// Only inject name if it doesn't already have one
					if (!shouldSkipNameInjection(t, args)) {
						const signalName = getSignalName(path, this.filename);
						if (signalName) injectSignalName(t, path, signalName);
					}
				}
			},
		},
	};
}
