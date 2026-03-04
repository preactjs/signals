/**
 * eslint-plugin-signals
 *
 * An ESLint/Oxlint plugin that catches common signal misuse patterns
 * in projects using @preact/signals-core, @preact/signals, or
 * @preact/signals-react.
 *
 * Rules:
 *   - signals/no-signal-write-in-computed
 *   - signals/no-value-after-await
 *   - signals/no-signal-truthiness
 *   - signals/no-signal-in-component-body
 *   - signals/no-conditional-value-read
 */

import noSignalWriteInComputed from "./rules/no-signal-write-in-computed.mjs";
import noValueAfterAwait from "./rules/no-value-after-await.mjs";
import noSignalTruthiness from "./rules/no-signal-truthiness.mjs";
import noSignalInComponentBody from "./rules/no-signal-in-component-body.mjs";
import noConditionalValueRead from "./rules/no-conditional-value-read.mjs";

const plugin = {
	meta: {
		name: "eslint-plugin-signals",
		version: "0.1.0",
	},
	rules: {
		"no-signal-write-in-computed": noSignalWriteInComputed,
		"no-value-after-await": noValueAfterAwait,
		"no-signal-truthiness": noSignalTruthiness,
		"no-signal-in-component-body": noSignalInComponentBody,
		"no-conditional-value-read": noConditionalValueRead,
	},
};

export default plugin;
