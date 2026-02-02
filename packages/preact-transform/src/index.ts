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

function isNameableCall(path: NodePath<BabelTypes.CallExpression>): boolean {
	const callee = path.get("callee");

	// Check direct function calls like signal(), computed(), useSignal(), useComputed(), action(), createModel()
	if (callee.isIdentifier()) {
		const name = callee.node.name;
		return (
			name === "signal" ||
			name === "computed" ||
			name === "useSignal" ||
			name === "useComputed" ||
			name === "action" ||
			name === "createModel"
		);
	}

	return false;
}

function getVariableNameFromDeclarator(
	path: NodePath<BabelTypes.CallExpression>
): string | null {
	// Walk up the AST to find a variable declarator or object property
	let currentPath: NodePath | null = path;
	let memberName: string | null = null;

	while (currentPath) {
		// Check for object property (e.g., { count: signal(0) })
		if (
			currentPath.isObjectProperty() &&
			currentPath.node.key.type === "Identifier"
		) {
			// Save the property name and continue looking for a model
			if (!memberName) {
				memberName = currentPath.node.key.name;
			}
		}
		// Check for variable declarator (e.g., const count = signal(0))
		if (
			currentPath.isVariableDeclarator() &&
			currentPath.node.id.type === "Identifier"
		) {
			// If we already found a member name, check if this is a createModel call
			if (memberName) {
				const init = currentPath.get("init");
				if (
					init.isCallExpression() &&
					init.get("callee").isIdentifier() &&
					(init.get("callee").node as BabelTypes.Identifier).name ===
						"createModel"
				) {
					// Return "ModelName.memberName"
					return `${currentPath.node.id.name}.${memberName}`;
				}
				// Not inside a createModel, just return the member name
				return memberName;
			}
			// This is the first name we found - save it and continue looking for a model
			memberName = currentPath.node.id.name;
		}
		currentPath = currentPath.parentPath;
	}
	return memberName;
}

function hasNameInOptions(
	t: typeof BabelTypes,
	args: NodePath<
		| BabelTypes.Expression
		| BabelTypes.SpreadElement
		| BabelTypes.JSXNamespacedName
		| BabelTypes.ArgumentPlaceholder
	>[]
): boolean {
	// Check if there's a second argument with a name property
	if (args.length >= 2) {
		const optionsArg = args[1];
		if (optionsArg.isObjectExpression()) {
			return optionsArg.node.properties.some(prop => {
				if (t.isObjectProperty(prop) && !prop.computed) {
					if (t.isIdentifier(prop.key, { name: "name" })) {
						return true;
					}
					if (t.isStringLiteral(prop.key) && prop.key.value === "name") {
						return true;
					}
				}
				return false;
			});
		}
	}
	return false;
}

function injectSignalName(
	t: typeof BabelTypes,
	path: NodePath<BabelTypes.CallExpression>,
	variableName: string,
	filename: string | undefined
): void {
	const args = path.get("arguments");

	// Create enhanced name with filename and line number
	let nameValue = variableName;
	if (filename) {
		const baseName = basename(filename);
		const lineNumber = path.node.loc?.start.line;
		if (baseName && lineNumber) {
			nameValue = `${variableName} (${baseName}:${lineNumber})`;
		}
	}

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
		// Two or more arguments, modify existing options object
		const optionsArg = args[1];
		if (optionsArg.isObjectExpression()) {
			// Add name property to existing options object
			optionsArg.node.properties.push(
				t.objectProperty(t.identifier("name"), name)
			);
		} else {
			// Replace second argument with options object containing name
			const nameOption = t.objectExpression([
				t.objectProperty(t.identifier("name"), name),
			]);
			args[1].replaceWith(nameOption);
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
				if (isEnabled && isNameableCall(path)) {
					const args = path.get("arguments");

					// Only inject name if it doesn't already have one
					if (!hasNameInOptions(t, args)) {
						const variableName = getVariableNameFromDeclarator(path);
						if (variableName) {
							injectSignalName(t, path, variableName, this.filename);
						}
					}
				}
			},
		},
	};
}
