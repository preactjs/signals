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
//    - When it is set to a valid dispatcher (not the invalid one), start a
//      preact/signal effect
//    - When it is set to the invalid dispatcher (one that throws), stop the
//      effect
//    - Note: If a component throws, the CurrentDispatcher is reset so we should
//      be able to clear our state
//    - We need to store the created updater (aka Effect) for each component to
//      track which signals are mounted/updated between rerenders (I think)? We
//      should just store this in our useReducer instead of a WeakMap?
//    - Check if a dispatcher is invalid by checking if the implementation of
//      useCallback.length < 2 or if the text of the function contains
//      `"warnInvalidHookAccess"`
//    - Additional edge cases to be aware of:
//        - In dev, React will change the dispatcher inside of useReducer before
//          invoking the reducer (solve by using the locking mechanism in
//          Jason's prototype?)
//        - Some hooks will change the dispatcher (like `use`) while rendering.
//          We need to handle this. Perhaps if changing from a valid dispatcher
//          to a valid dispatcher, don't reset the effect?
//        - Definitely cache all seen dispatchers in a WeakMap to speed look up
//          on rerenders
// - For class components: Use CurrentOwner to mimic the above behavior
//
// TODO (tests):
// - Test on react.dev and react.production.min.js.
// - Test on a component that uses useReducer (to trigger the edge case where
//   dispatcher changes during render)

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
// component, the dispatcher is set to an erroring one again.
//
// So, we use this getter and setter to monitor the changes to the current
// ReactDispatcher. When the dispatcher changes from an erroring one to a valid
// dispatcher, we assume we are entering a component render. At this point, we
// setup our auto-subscriptions for any signals used in the component. We do
// this by creating an effect and manually starting the effect. We use
// `useReducer` to get access to a `rerender` function that we can use to
// manually trigger a rerender when a signal we've subscribed changes.
//
// When the dispatcher changes from a valid dispatcher to an erroring one, we
// assume we are exiting a component render. At this point we stop the effect.
//
// Some edge cases to be aware of:
// - In development, useReducer changes the dispatcher to an erroring dispatcher
//   before invoking the reducer and resets it right after. We need to ensure
//   this doesn't trigger our effect logic when we invoke useReducer. We use a
//   boolean to track whether we are currently in our useReducer call.
//
//   Subsequent calls to useReducer will also change the dispatcher, but by
//   storing the updater in a WeakMap keyed by the rerender function, we can
//   ensure we don't create a new updater for each call to useReducer.
//
//   TODO: Does the above logic actually work? I think it might not because we
//   have to invoke useReducer to get the rerender function which only works if
//   we always invoke it in the same order. Consider removing the
//   `/warnInvalidHookAccess/` check so only the ContextOnlyDispatcher is
//   triggers exiting.
//
// - The `use` hook will change the dispatcher to from a valid update dispatcher
//   to a valid mount dispatcher in some cases. So just changing the dispatcher
//   isn't enough to know if we are exiting a component render. We need to check
//   if we are currently in a valid dispatcher and the next one is a erroring
//   one to exit.
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

		// TODO: Comment these two lines and describe how `use` hook changes the
		// dispatcher from a valid one to a different valid one is some situations
		const isEnteringComponentRender =
			isErroringDispatcher(currentDispatcher) &&
			!isErroringDispatcher(nextDispatcher);

		// TODO: Will this incorrectly be true if a component uses useReducer? using
		// the WeakMap made it not matter... Perhaps we can use the rerender
		// function as the key instead of the ReactCurrentOwner into the
		// updaterForComponent WeakMap?
		const isExitingComponentRender =
			!isErroringDispatcher(currentDispatcher) &&
			isErroringDispatcher(nextDispatcher);

		if (isEnteringComponentRender) {
			// useReducer changes the dispatcher to a throwing one while useReducer is
			// running in dev mode, so lock our CurrentDispatcher setter to not run
			// while our useReducer is running.
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
const invalidHookAccessors = new Map();
function isErroringDispatcher(dispatcher: ReactDispatcher | null) {
	// Treat null as the invalid/erroring dispatcher
	if (!dispatcher) return true;

	const cached = invalidHookAccessors.get(dispatcher);
	if (cached !== undefined) return cached;

	// we only want the real implementation, not the erroring or warning ones
	const invalid =
		dispatcher.useCallback.length < 2 ||
		/warnInvalidHookAccess/.test(dispatcher.useCallback as any);
	invalidHookAccessors.set(dispatcher, invalid);
	return invalid;
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
