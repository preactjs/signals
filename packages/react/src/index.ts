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
import type { Effect, JsxRuntimeModule } from "./internal";

export { signal, computed, batch, effect, Signal, type ReadonlySignal };

const Empty = [] as const;
const ReactElemType = Symbol.for("react.element"); // https://github.com/facebook/react/blob/346c7d4c43a0717302d446da9e7423a8e28d8996/packages/shared/ReactSymbols.js#L15

// Idea:
// - For Function components: Use CurrentDispatcher to add the signal effect
//   store to every component (kinda expensive?).
//    - Actually we could probably skip using useSyncExternalStore and just use
//      the effect instance directly... Ideally that'd means components that
//      don't use any signals incur no persistent memory cost, outside of an
//      empty call to useReducer to generate a rerender function.
//
//      Though maybe useSyncExternalStore makes it more concurrent mode safe? It
//      seems that useSyncExternalStore may be efficient enough if we don't
//      allocate more objects (aka the store). Though the
//      `pushStoreConsistencyCheck` function would have a object per
//      component... and then it'd have to loop through all of them to check if
//      a store changed while rendering (if doing non-blocking work? So
//      something concurrent related?). useSyncExternalStore probably isn't
//      intended to be used on EVERY component.
//
//      Conclusion: Let's avoid useSyncExternalStore for now, and bring it if we
//      find bugs.
//
// - For class components: Use CurrentOwner to mimic the above behavior

interface ReactDispatcher {
	useCallback: typeof useCallback;
	useReducer: typeof useReducer;
}

let finishUpdate: (() => void) | undefined;
const updaterForComponent = new WeakMap<object, Effect>();

function setCurrentUpdater(updater?: Effect) {
	// end tracking for the current update:
	if (finishUpdate) finishUpdate();
	// start tracking the new update:
	finishUpdate = updater && updater._start();
}

function createUpdater(rerender: () => void): Effect {
	let updater!: Effect;
	effect(function (this: Effect) {
		updater = this;
	});
	updater._callback = rerender;
	return updater;
}

// To track when we are entering and exiting a component render (i.e. before and
// after React renders a component), we track how the dispatcher changes.
// Outside of a component rendering, the dispatcher is set to an instance that
// errors or warns when any hooks are called (this is too prevent hooks from
// being used outside of components). Right before React renders a component,
// the dispatcher is set to a valid one. Right after React finishes rendering a
// component, the dispatcher is set to an erroring one again. This erroring
// dispatcher is called `ContextOnlyDispatcher` in React's source.
//
// So, we use this getter and setter to monitor the changes to the current
// ReactDispatcher. When the dispatcher changes from the ContextOnlyDispatcher
// to a valid dispatcher, we assume we are entering a component render. At this
// point, we setup our auto-subscriptions for any signals used in the component.
// We do this by creating an effect and manually starting the effect. We use
// `useReducer` to get access to a `rerender` function that we can use to
// manually trigger a rerender when a signal we've subscribed changes.
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
//   When we invoke our own useReducer while entering a component render, we
//   need to prevent this change from re-triggering our logic. We do this by
//   using a lock to prevent the setter from running while we are in the setter.
//
//   When a Component's function body invokes useReducer, useState, or useMemo,
//   this change in dispatcher should not signal that we are exiting a component
//   render. We ignore this change cuz this erroring dispatcher does not pass
//   the ContextOnlyDispatcher check and so does not affect our logic.
//
// - The `use` hook will change the dispatcher to from a valid update dispatcher
//   to a valid mount dispatcher in some cases. Similarly to useReducer
//   mentioned above, we should not signal that we are exiting a component
//   during this change. Because these other dispatchers do not pass the
//   ContextOnlyDispatcher check, they do not affect our logic.
let lock = false;
const FORCE_UPDATE = () => ({});
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

		const isEnteringComponentRender =
			isContextOnlyDispatcher(currentDispatcher) &&
			!isContextOnlyDispatcher(nextDispatcher);

		const isExitingComponentRender =
			!isContextOnlyDispatcher(currentDispatcher) &&
			isContextOnlyDispatcher(nextDispatcher);

		if (isEnteringComponentRender) {
			lock = true;
			// TODO: Consider switching to useSyncExternalStore
			const rerender = nextDispatcher.useReducer(FORCE_UPDATE, {})[1];
			lock = false;

			let updater = updaterForComponent.get(rerender);
			if (!updater) {
				updater = createUpdater(rerender);
				updaterForComponent.set(rerender, updater);
			}

			setCurrentUpdater(updater);
		} else if (isExitingComponentRender) {
			setCurrentUpdater();
		}

		currentDispatcher = nextDispatcher;
	},
});

// We inject a useReducer into every function component via CurrentDispatcher.
// This prevents injecting into anything other than a function component render.
const dispatcherTypeCache = new Map();
function isContextOnlyDispatcher(dispatcher: ReactDispatcher | null) {
	// Treat null the same as the ContextOnlyDispatcher.
	if (!dispatcher) return true;

	const cached = dispatcherTypeCache.get(dispatcher);
	if (cached !== undefined) return cached;

	// The ContextOnlyDispatcher sets all the hook implementations to a function
	// that takes no arguments and throws and error. Check the number of arguments
	// for this dispatcher's useCallback implementation to determine if it is a
	// ContextOnlyDispatcher. All other dispatchers, erroring or not, define
	// functions with arguments and so fail this check.
	const isContextOnlyDispatcher = dispatcher.useCallback.length < 2;
	dispatcherTypeCache.set(dispatcher, isContextOnlyDispatcher);
	return isContextOnlyDispatcher;
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
