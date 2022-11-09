export interface Effect {
	_sources: object | undefined;
	_start(): () => void;
	_callback(): void;
	_dispose(): void;
}

export interface JsxRuntimeModule {
	jsx?(type: any, ...rest: any[]): unknown;
	jsxs?(type: any, ...rest: any[]): unknown;
	jsxDEV?(type: any, ...rest: any[]): unknown;
}
