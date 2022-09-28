import {
	useRef,
	useMemo,
	useEffect,
	// @ts-ignore-next-line
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED as internals,
} from "react";
import React from "react";
import { useSyncExternalStore } from "use-sync-external-store/shim";
import {
	signal,
	computed,
	batch,
	effect,
	Signal,
	type ReadonlySignal,
} from "@preact/signals-core";
import { Effect, ReactDispatcher } from "./internal";

export { signal, computed, batch, effect, Signal, type ReadonlySignal };

const Empty = Object.freeze([]);

/**
 * React uses a different entry-point depending on NODE_ENV env var
 */
const __DEV__ = process.env.NODE_ENV !== "production";

/**
 * Install a middleware into React.createElement to replace any Signals in props with their value.
 * @todo this likely needs to be duplicated for jsx()...
 */
const createElement = React.createElement;
// @ts-ignore-next-line
React.createElement = function (type, props) {
	if (typeof type === "string" && props) {
		for (let i in props) {
			let v = props[i];
			if (i !== "children" && v instanceof Signal) {
				// createPropUpdater(props, i, v);
				props[i] = v.value;
			}
		}
	}
	// @ts-ignore-next-line
	return createElement.apply(this, arguments);
};

/*
// This breaks React's controlled components implementation
function createPropUpdater(props: any, prop: string, signal: Signal) {
	let ref = props.ref;
	if (!ref) ref = props.ref = React.createRef();
	effect(() => {
		if (props) props[prop] = signal.value;
		let el = ref.current;
		if (!el) return; // unsubscribe
		(el as any)[prop] = signal.value;
	});
	props = null;
}
*/

let finishUpdate: (() => void) | undefined;

function setCurrentUpdater(updater?: Effect) {
	// end tracking for the current update:
	if (finishUpdate) finishUpdate();
	// start tracking the new update:
	finishUpdate = updater && updater._start();
}

/**
 * A redux-like store whose store value is a positive 32bit integer (a 'version') to be used with useSyncExternalStore API.
 * React (current owner) subscribes to this store and gets a snapshot of the current 'version'.
 * Whenever the 'version' changes, we tell React it's time to update the component (call 'onStoreChange').
 *
 * How we achieve this is by creating a binding with an 'effect', when the `effect._callback' is called,
 * we update our store version and tell React to re-render the component ([1] We don't really care when/how React does it).
 *
 * [1]
 * @see https://reactjs.org/docs/hooks-reference.html#usesyncexternalstore
 * @see https://github.com/reactjs/rfcs/blob/main/text/0214-use-sync-external-store.md
 */
function createEffectStore() {
	let updater!: Effect;
	let version = 0;
	let onChangeNotifyReact: (() => void) | undefined;

	const unsubscribe = effect(function (this: Effect) {
		updater = this;
	});


	updater._callback = function () {
		if (!onChangeNotifyReact) {
			/**
			 * In dev, lazily unsubscribe self if React isn't subscribed to the store,
			 * in other words, if the component is not mounted anymore.
			 *
			 * We do this to deal with StrictMode double rendering React quirks.
			 * Only one of the renders is actually mounted.
			 */
			return void unsubscribe();
		}

		version = (version + 1) | 0;
		onChangeNotifyReact();
	};

	return {
		updater,
		subscribe(onStoreChange: () => void) {
			onChangeNotifyReact = onStoreChange;

			return function () {
				/**
				 * In StrictMode (in dev mode), React will play with subscribe/unsubscribe/subscribe in double renders,
				 * We don't really want to unsubscribe during React's play-time and can't reliably know which of renders
				 * will end up actually being mounted, so we defer unsubscribe to the updater._callback.
				 */
				if (!__DEV__) unsubscribe();
				onChangeNotifyReact = undefined;
			};
		},
		getSnapshot() {
			return version;
		},
	};
}

/**
 * A wrapper component that renders a Signal's value directly as a Text node.
 */
function Text({ data }: { data: Signal }) {
	return data.value;
}

// Decorate Signals so React renders them as <Text> components.
//@ts-ignore-next-line
const $$typeof = createElement("a").$$typeof;
Object.defineProperties(Signal.prototype, {
	$$typeof: { configurable: true, value: $$typeof },
	type: { configurable: true, value: Text },
	props: {
		configurable: true,
		get() {
			return { data: this };
		},
	},
	ref: { configurable: true, value: null },
});

// Track the current dispatcher (roughly equiv to current component impl)
let lock = false;
let currentDispatcher: ReactDispatcher;

Object.defineProperty(internals.ReactCurrentDispatcher, "current", {
	get() {
		return currentDispatcher;
	},
	set(api: ReactDispatcher) {
		currentDispatcher = api;
		if (lock) return;
		if (api && !isInvalidHookAccessor(api)) {
			// prevent re-injecting useMemo & useSyncExternalStore when the Dispatcher
			// context changes.
			lock = true;

			const store = api.useMemo(createEffectStore, Empty);

			useSyncExternalStore(
				store.subscribe,
				store.getSnapshot,
				store.getSnapshot
			);

			lock = false;

			setCurrentUpdater(store.updater);
		} else {
			setCurrentUpdater();
		}
	},
});

// We inject a useReducer into every function component via CurrentDispatcher.
// This prevents injecting into anything other than a function component render.
const invalidHookAccessors = new Map();
function isInvalidHookAccessor(api: ReactDispatcher) {
	const cached = invalidHookAccessors.get(api);
	if (cached !== undefined) return cached;
	// we only want the real implementation, not the warning ones
	const invalid =
		api.useCallback.length < 2 || /Invalid/.test(api.useCallback as any);
	invalidHookAccessors.set(api, invalid);
	return invalid;
}

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
		return effect(() => {
			return callback.current();
		});
	}, Empty);
}
