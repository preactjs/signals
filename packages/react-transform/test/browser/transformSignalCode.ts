// The babel plugins and such are massive files that when included in test files
// slow down debugging. So I'm moving them to a separate file bundled separately
// and included directly by Karma so that test files don't need to bundle them.\

import { transform } from "@babel/standalone";
import transformEsm from "@babel/plugin-transform-modules-commonjs";
import syntaxJsx from "@babel/plugin-syntax-jsx";
import transformReactJsx from "@babel/plugin-transform-react-jsx";
import explicitResourceManagement from "@babel/plugin-transform-explicit-resource-management";
import signalsTransform from "@preact/signals-react-transform";

export function transformSignalCode(code: string, options?: any): string {
	const signalsPluginConfig = [signalsTransform];
	if (options) {
		signalsPluginConfig.push(options);
	}

	const result = transform(code, {
		plugins: [
			signalsPluginConfig,
			syntaxJsx,
			[transformReactJsx, { runtime: "automatic" }],
			[transformEsm, { importInterop: "none", loose: true, strict: true }],
			explicitResourceManagement,
		],
	});

	return result?.code || "";
}
