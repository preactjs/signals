import { Signal } from "@preact/signals-core";

export interface ReactOwner {
	_: never;
}

export interface ReactDispatcher {
	useCallback(): unknown;
}

export type Updater = Signal<unknown>;
