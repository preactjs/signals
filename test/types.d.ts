import type { signal, computed } from "@preact/signals-core";
import type { useSignal, useComputed } from "@preact/signals";

type StateUpdater<S> = (value: S | ((prevState: S) => S)) => void;
type Reducer<S, A> = (prevState: S, action: A) => S;

interface VDomLibrary {
	createElement(type: any, props: any, ...children: any[]): JSX.Element;
	useReducer<S, A>(
		reducer: Reducer<S, A>,
		initialState: S
	): [S, (action: A) => void];
	useReducer<S, A, I>(
		reducer: Reducer<S, A>,
		initialArg: I,
		init: (arg: I) => S
	): [S, (action: A) => void];
	useState<S = undefined>(): [S | undefined, StateUpdater<S | undefined>];
	useState<S>(initialState: S | (() => S)): [S, StateUpdater<S>];
}

interface SignalLibrary {
	signal: typeof signal;
	computed: typeof computed;
	useSignal: typeof useSignal;
	useComputed: typeof useComputed;
}
