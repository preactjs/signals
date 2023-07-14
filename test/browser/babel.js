// The babel plugins and such are massive files that when included in test files
// slow down debugging. So I'm moving them to a separate file bundled separately
// and included directly by Karma so that test files don't need to bundle them.\

import transformEsm from "@babel/plugin-transform-modules-commonjs";
import syntaxJsx from "@babel/plugin-syntax-jsx";
import transformReactJsx from "@babel/plugin-transform-react-jsx";
import { transform } from "@babel/standalone";
// @ts-expect-error
import signalsTransform from "@preact/signals-react-transform";
import explicitResourceManagement from "@babel/plugin-proposal-explicit-resource-management";

globalThis.transformSignalCode = function transformSignalCode(code, options) {
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
};
