import {
	useRef,
	useMemo,
	useEffect,
	// @ts-ignore-next-line
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED as ReactInternals,
	type ReactElement,
	type useCallback,
	type useReducer,
} from "react";
import React from "react";
import jsxRuntime from "react/jsx-runtime";
import jsxRuntimeDev from "react/jsx-dev-runtime";
import {
	signal,
	computed,
	batch,
	effect,
	Signal,
	type ReadonlySignal,
} from "@preact/signals-core";
import { useSyncExternalStore } from "use-sync-external-store/shim/index.js";
import type { Effect, JsxRuntimeModule } from "./internal";

export { signal, computed, batch, effect, Signal, type ReadonlySignal };

const Empty = [] as const;
const ReactElemType = Symbol.for("react.element"); // https://github.com/facebook/react/blob/346c7d4c43a0717302d446da9e7423a8e28d8996/packages/shared/ReactSymbols.js#L15

interface ReactDispatcher {
	useRef: typeof useRef;
	useCallback: typeof useCallback;
	useReducer: typeof useReducer;
	useSyncExternalStore: typeof useSyncExternalStore;
}

let finishUpdate: (() => void) | undefined;

function setCurrentUpdater(updater?: Effect) {
	// end tracking for the current update:
	if (finishUpdate) finishUpdate();
	// start tracking the new update:
	finishUpdate = updater && updater._start();
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

/**
 * Custom hook to create the effect to track signals used during render and
 * subscribe to changes to rerender the component when the signals change
 */
function usePreactSignalStore(nextDispatcher: ReactDispatcher): EffectStore {
	const storeRef = nextDispatcher.useRef<EffectStore>();
	if (storeRef.current == null) {
		storeRef.current = createEffectStore();
	}

	const store = storeRef.current;
	useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

	return store;
}

// To track when we are entering and exiting a component render (i.e. before and
// after React renders a component), we track how the dispatcher changes.
// Outside of a component rendering, the dispatcher is set to an instance that
// errors or warns when any hooks are called. This behavior is prevents hooks
// from being used outside of components. Right before React renders a
// component, the dispatcher is set to a valid one. Right after React finishes
// rendering a component, the dispatcher is set to an erroring one again. This
// erroring dispatcher is called the `ContextOnlyDispatcher` in React's source.
//
// So, we watch the getter and setter on `ReactCurrentDispatcher.current` to
// monitor the changes to the current ReactDispatcher. When the dispatcher
// changes from the ContextOnlyDispatcher to a valid dispatcher, we assume we
// are entering a component render. At this point, we setup our
// auto-subscriptions for any signals used in the component. We do this by
// creating an effect and manually starting the effect. We use
// `useSyncExternalStore` to trigger rerenders on the component when any signals
// it uses changes.
//
// When the dispatcher changes from a valid dispatcher back to the
// ContextOnlyDispatcher, we assume we are exiting a component render. At this
// point we stop the effect.
//
// Some edge cases to be aware of:
// - In development, useReducer, useState, and useMemo changes the dispatcher to
//   a different erroring dispatcher before invoking the reducer and resets it
//   right after.
//
//   The useSyncExternalStore shim will use some of these hooks when we invoke
//   it while entering a component render. We need to prevent this dispatcher
//   change caused by these hooks from re-triggering our entering logic (it
//   would cause an infinite loop if we did not). We do this by using a lock to
//   prevent the setter from running while we are in the setter.
//
//   When a Component's function body invokes useReducer, useState, or useMemo,
//   this change in dispatcher should not signal that we are exiting a component
//   render. We ignore this change by detecting these dispatchers as different
//   from ContextOnlyDispatcher and other valid dispatchers.
//
// - The `use` hook will change the dispatcher to from a valid update dispatcher
//   to a valid mount dispatcher in some cases. Similarly to useReducer
//   mentioned above, we should not signal that we are exiting a component
//   during this change. Because these other valid dispatchers do not pass the
//   ContextOnlyDispatcher check, they do not affect our logic.
let lock = false;
let currentDispatcher: ReactDispatcher | null = null;
Object.defineProperty(ReactInternals.ReactCurrentDispatcher, "current", {
	get() {
		return currentDispatcher;
	},
	set(nextDispatcher: ReactDispatcher) {
		if (lock) {
			currentDispatcher = nextDispatcher;
			return;
		}

		const currentDispatcherType = getDispatcherType(currentDispatcher);
		const nextDispatcherType = getDispatcherType(nextDispatcher);

		// We are entering a component render if the current dispatcher is the
		// ContextOnlyDispatcher and the next dispatcher is a valid dispatcher.
		const isEnteringComponentRender =
			currentDispatcherType === ContextOnlyDispatcherType &&
			nextDispatcherType === ValidDispatcherType;

		// We are exiting a component render if the current dispatcher is a valid
		// dispatcher and the next dispatcher is the ContextOnlyDispatcher.
		const isExitingComponentRender =
			currentDispatcherType === ValidDispatcherType &&
			nextDispatcherType === ContextOnlyDispatcherType;

		// Update the current dispatcher now so the hooks inside of the
		// useSyncExternalStore shim get the right dispatcher.
		currentDispatcher = nextDispatcher;
		if (isEnteringComponentRender) {
			lock = true;
			const store = usePreactSignalStore(nextDispatcher);
			lock = false;

			setCurrentUpdater(store.updater);
		} else if (isExitingComponentRender) {
			setCurrentUpdater();
		}
	},
});

const ValidDispatcherType = 0;
const ContextOnlyDispatcherType = 1;
const ErroringDispatcherType = 2;

// We inject a useSyncExternalStore into every function component via
// CurrentDispatcher. This prevents injecting into anything other than a
// function component render.
const dispatcherTypeCache = new Map<ReactDispatcher, number>();
function getDispatcherType(dispatcher: ReactDispatcher | null): number {
	// Treat null the same as the ContextOnlyDispatcher.
	if (!dispatcher) return ContextOnlyDispatcherType;

	const cached = dispatcherTypeCache.get(dispatcher);
	if (cached !== undefined) return cached;

	// The ContextOnlyDispatcher sets all the hook implementations to a function
	// that takes no arguments and throws and error. Check the number of arguments
	// for this dispatcher's useCallback implementation to determine if it is a
	// ContextOnlyDispatcher. All other dispatchers, erroring or not, define
	// functions with arguments and so fail this check.
	let type: number;
	if (dispatcher.useCallback.length < 2) {
		type = ContextOnlyDispatcherType;
	} else if (/Invalid/.test(dispatcher.useCallback as any)) {
		type = ErroringDispatcherType;
	} else {
		type = ValidDispatcherType;
	}

	dispatcherTypeCache.set(dispatcher, type);
	return type;
}

function WrapJsx<T>(jsx: T): T {
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

const JsxPro: JsxRuntimeModule = jsxRuntime;
const JsxDev: JsxRuntimeModule = jsxRuntimeDev;

/**
 * createElement _may_ be called by jsx runtime as a fallback in certain cases,
 * so we need to wrap it regardless.
 *
 * The jsx exports depend on the `NODE_ENV` var to ensure the users' bundler doesn't
 * include both, so one of them will be set with `undefined` values.
 */
React.createElement = WrapJsx(React.createElement);
JsxDev.jsx && /*   */ (JsxDev.jsx = WrapJsx(JsxDev.jsx));
JsxPro.jsx && /*   */ (JsxPro.jsx = WrapJsx(JsxPro.jsx));
JsxDev.jsxs && /*  */ (JsxDev.jsxs = WrapJsx(JsxDev.jsxs));
JsxPro.jsxs && /*  */ (JsxPro.jsxs = WrapJsx(JsxPro.jsxs));
JsxDev.jsxDEV && /**/ (JsxDev.jsxDEV = WrapJsx(JsxDev.jsxDEV));
JsxPro.jsxDEV && /**/ (JsxPro.jsxDEV = WrapJsx(JsxPro.jsxDEV));

declare module "@preact/signals-core" {
	// @ts-ignore internal Signal is viewed as function
	// eslint-disable-next-line @typescript-eslint/no-empty-interface
	interface Signal extends ReactElement {}
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
