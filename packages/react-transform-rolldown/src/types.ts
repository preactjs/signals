export interface ReactSignalsTransformPluginOptions {
	mode?: "auto" | "manual" | "all";
	importSource?: string;
	detectTransformedJSX?: boolean;
	experimental?: {
		debug?: boolean;
		noTryFinally?: boolean;
	};
}
