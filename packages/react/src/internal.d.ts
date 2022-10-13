import { Signal } from "@preact/signals-core";

export interface Effect {
	_sources: object | undefined;
	_start(): () => void;
	_callback(): void;
	_dispose(): void;
}

export type Updater = Signal<unknown>;

export interface JsxRuntimeModule {
	jsx?(type: any, ...rest: any[]): unknown;
	jsxs?(type: any, ...rest: any[]): unknown;
	jsxDEV?(type: any, ...rest: any[]): unknown;
}
