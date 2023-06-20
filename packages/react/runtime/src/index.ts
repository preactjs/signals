import { signal, computed, effect, Signal } from "@preact/signals-core";
import { useRef, useMemo, useEffect } from "react";
import { useSyncExternalStore } from "use-sync-external-store/shim/index.js";

export { installAutoSignalTracking } from "./auto";

const Empty = [] as const;
const ReactElemType = Symbol.for("react.element"); // https://github.com/facebook/react/blob/346c7d4c43a0717302d446da9e7423a8e28d8996/packages/shared/ReactSymbols.js#L15

export function wrapJsx<T>(jsx: T): T {
	if (typeof jsx !== "function") return jsx;

	return function (type: any, props: any, ...rest: any[]) {
		if (typeof type === "string" && props) {
			for (let i in props) {
				let v = props[i];
				if (i !== "children" && v instanceof Signal) {
					props[i] = v.value;
				}
			}
		}

		return jsx.call(jsx, type, props, ...rest);
	} as any as T;
}

interface Effect {
	_sources: object | undefined;
	_start(): () => void;
	_callback(): void;
	_dispose(): void;
}

interface EffectStore {
	updater: Effect;
	subscribe(onStoreChange: () => void): () => void;
	getSnapshot(): number;
}

/**
 * A redux-like store whose store value is a positive 32bit integer (a 'version').
 *
 * React subscribes to this store and gets a snapshot of the current 'version',
 * whenever the 'version' changes, we tell React it's time to update the component (call 'onStoreChange').
 *
 * How we achieve this is by creating a binding with an 'effect', when the `effect._callback' is called,
 * we update our store version and tell React to re-render the component ([1] We don't really care when/how React does it).
 *
 * [1]
 * @see https://react.dev/reference/react/useSyncExternalStore
 * @see https://github.com/reactjs/rfcs/blob/main/text/0214-use-sync-external-store.md
 */
function createEffectStore(): EffectStore {
	let updater!: Effect;
	let version = 0;
	let onChangeNotifyReact: (() => void) | undefined;

	let unsubscribe = effect(function (this: Effect) {
		updater = this;
	});
	updater._callback = function () {
		version = (version + 1) | 0;
		if (onChangeNotifyReact) onChangeNotifyReact();
	};

	return {
		updater,
		subscribe(onStoreChange) {
			onChangeNotifyReact = onStoreChange;

			return function () {
				/**
				 * Rotate to next version when unsubscribing to ensure that components are re-run
				 * when subscribing again.
				 *
				 * In StrictMode, 'memo'-ed components seem to keep a stale snapshot version, so
				 * don't re-run after subscribing again if the version is the same as last time.
				 *
				 * Because we unsubscribe from the effect, the version may not change. We simply
				 * set a new initial version in case of stale snapshots here.
				 */
				version = (version + 1) | 0;
				onChangeNotifyReact = undefined;
				unsubscribe();
			};
		},
		getSnapshot() {
			return version;
		},
	};
}

let finishUpdate: (() => void) | undefined;

function setCurrentUpdater(updater?: Effect) {
	// end tracking for the current update:
	if (finishUpdate) finishUpdate();
	// start tracking the new update:
	finishUpdate = updater && updater._start();
}

const clearCurrentUpdater = () => setCurrentUpdater();

/**
 * Custom hook to create the effect to track signals used during render and
 * subscribe to changes to rerender the component when the signals change
 */
export function useSignals(): () => void {
	const storeRef = useRef<EffectStore>();
	if (storeRef.current == null) {
		storeRef.current = createEffectStore();
	}

	const store = storeRef.current;
	useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
	setCurrentUpdater(store.updater);

	return clearCurrentUpdater;
}

/**
 * A wrapper component that renders a Signal's value directly as a Text node.
 */
function Text({ data }: { data: Signal }) {
	return data.value;
}

// Decorate Signals so React renders them as <Text> components.
Object.defineProperties(Signal.prototype, {
	$$typeof: { configurable: true, value: ReactElemType },
	type: { configurable: true, value: Text },
	props: {
		configurable: true,
		get() {
			return { data: this };
		},
	},
	ref: { configurable: true, value: null },
});

export function useSignal<T>(value: T) {
	return useMemo(() => signal<T>(value), Empty);
}

export function useComputed<T>(compute: () => T) {
	const $compute = useRef(compute);
	$compute.current = compute;
	return useMemo(() => computed<T>(() => $compute.current()), Empty);
}

export function useSignalEffect(cb: () => void | (() => void)) {
	const callback = useRef(cb);
	callback.current = cb;

	useEffect(() => {
		return effect(() => callback.current());
	}, Empty);
}
