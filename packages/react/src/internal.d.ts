import { Signal } from "@preact/signals-core";

export interface Effect {
	_sources: object | undefined;
	_start(): () => void;
	_callback(): void;
	_dispose(): void;
}

export interface ReactOwner {
	_: never;
}

export interface ReactDispatcher {
	useCallback(): unknown;
}

export type Updater = Signal<unknown>;
