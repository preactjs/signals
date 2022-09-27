import { Signal } from "@preact/signals-core";
import type { useCallback, useMemo, useSyncExternalStore } from "react"

export interface Effect {
	_sources: object | undefined;
	_start(): () => void;
	_callback(): void;
	_dispose(): void;
}

export interface ReactDispatcher {
	useCallback: typeof useCallback;
	useMemo: typeof useMemo;
	useSyncExternalStore: typeof useSyncExternalStore;
}

export type Updater = Signal<unknown>;
