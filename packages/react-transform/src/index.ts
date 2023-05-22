import type {
	types as BabelTypes,
	template as BabelTemplate,
	PluginObj,
} from "@babel/core";

interface PluginArgs {
	types: typeof BabelTypes;
	template: typeof BabelTemplate;
}

export default function signalsTransform({ types: t }: PluginArgs): PluginObj {
	return {
		name: "@preact/signals-transform",
		visitor: {
			ArrowFunctionExpression(path) {
				const parentNode = path.parentPath.node;

				// Check if the arrow function is a React component.
				// This is a simplification, actual check might be more involved.
				if (
					t.isVariableDeclarator(parentNode) &&
					t.isIdentifier(parentNode.id) &&
					parentNode.id.name.match(/^[A-Z]/)
				) {
					const tryStatement = t.blockStatement([
						t.tryStatement(
							t.isBlockStatement(path.node.body)
								? path.node.body // Preserve existing blocks from arrow function.
								: // An arrow functions whose body is an expression (i.e. () =>
								  // <div />) implicit returns the expression value. Since we are wrapping the
								  // function body in a try/catch, we need to explicitly return the expression body.
								  t.blockStatement([t.returnStatement(path.node.body)]),
							null,
							t.blockStatement([])
						),
					]);

					path.node.body = tryStatement;
				}
			},

			FunctionDeclaration(path) {
				const functionName = path.node.id?.name;

				// Check if the function is a React component.
				if (functionName?.match(/^[A-Z]/)) {
					const tryStatement = t.tryStatement(
						t.blockStatement(path.node.body.body),
						null,
						t.blockStatement([])
					);

					path.node.body = t.blockStatement([tryStatement]);
				}
			},
		},
	};
}
