// @ts-check
import { fileURLToPath } from "node:url";
import path from "node:path";
import { transformAsync } from "@babel/core";

/**
 * @returns {import('vite').Plugin}
 */
export function transformReactTests() {
	const __dirname = path.dirname(fileURLToPath(import.meta.url));
	const projectRoot = path.resolve(__dirname, "..");
	const reactTransformPath = path.join(projectRoot, "packages/react-transform");

	return {
		name: "react-transform",
		transform: {
			order: "pre",
			async handler(code, id) {
				if (
					id.includes("node_modules") ||
					(!id.includes("packages/react/test/shared") &&
						!id.includes("packages/react/runtime/test"))
				) {
					return null;
				}

				if (
					!id.endsWith(".js") &&
					!id.endsWith(".ts") &&
					!id.endsWith(".jsx") &&
					!id.endsWith(".tsx")
				) {
					return null;
				}

				const result = await transformAsync(code, {
					filename: id,
					sourceMaps: true,
					presets: [
						[
							"@babel/preset-typescript",
							{
								jsxPragma: "createElement",
								jsxPragmaFrag: "Fragment",
							},
						],
						[
							"@babel/preset-react",
							{
								runtime: "classic",
								pragma: "createElement",
								pragmaFrag: "Fragment",
							},
						],
					],
					plugins: [[reactTransformPath, { mode: "auto" }]],
				});

				return result?.code
					? {
							code: result?.code,
							map: result?.map,
						}
					: null;
			},
		},
	};
}
