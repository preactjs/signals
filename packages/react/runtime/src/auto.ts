import {
	// @ts-ignore-next-line
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED as ReactInternals,
	version as reactVersion,
} from "react";
import React from "react";
import jsxRuntime from "react/jsx-runtime";
import jsxRuntimeDev from "react/jsx-dev-runtime";
import { EffectStore, wrapJsx, _useSignalsImplementation } from "./index";

export interface ReactDispatcher {
	useRef: typeof React.useRef;
	useCallback: typeof React.useCallback;
	useReducer: typeof React.useReducer;
	useSyncExternalStore: typeof React.useSyncExternalStore;
	useEffect: typeof React.useEffect;
	useImperativeHandle: typeof React.useImperativeHandle;
}

// In order for signals to work in React, we need to observe what signals a
// component uses while rendering. To do this, we need to know when a component
// is rendering. To do this, we watch the transition of the
// ReactCurrentDispatcher to know when a component is rerendering.
//
// To track when we are entering and exiting a component render (i.e. before and
// after React renders a component), we track how the dispatcher changes.
// Outside of a component rendering, the dispatcher is set to an instance that
// errors or warns when any hooks are called. This behavior is prevents hooks
// from being used outside of components. Right before React renders a
// component, the dispatcher is set to an instance that doesn't warn or error
// and contains the implementations of all hooks. Right after React finishes
// rendering a component, the dispatcher is set to the erroring one again. This
// erroring dispatcher is called the `ContextOnlyDispatcher` in React's source.
//
// So, we watch the getter and setter on `ReactCurrentDispatcher.current` to
// monitor the changes to the current ReactDispatcher. When the dispatcher
// changes from the ContextOnlyDispatcher to a "valid" dispatcher, we assume we
// are entering a component render. At this point, we setup our
// auto-subscriptions for any signals used in the component. We do this by
// creating an Signal effect and manually starting the Signal effect. We use
// `useSyncExternalStore` to trigger rerenders on the component when any signals
// it uses changes.
//
// When the dispatcher changes from a valid dispatcher back to the
// ContextOnlyDispatcher, we assume we are exiting a component render. At this
// point we stop the effect.
//
// Some additional complexities to be aware of:
// - If a component calls `setState` while rendering, React will re-render the
//   component immediately. Before triggering the re-render, React will change
//   the dispatcher to the HooksDispatcherOnRerender. When we transition to this
//   rerendering adapter, we need to re-trigger our hooks to keep the order of
//   hooks the same for every render of a component.
//
// - In development, useReducer, useState, and useMemo change the dispatcher to
//   a different warning dispatcher (not ContextOnlyDispatcher) before invoking
//   the reducer and resets it right after.
//
//   The useSyncExternalStore shim will use some of these hooks when we invoke
//   it while entering a component render. We need to prevent this dispatcher
//   change caused by these hooks from re-triggering our entering logic (it
//   would cause an infinite loop if we did not). We do this by using a lock to
//   prevent the setter from running while we are in the setter.
//
//   When a Component's function body invokes useReducer, useState, or useMemo,
//   this change in dispatcher should not signal that we are entering or exiting
//   a component render. We ignore this change by detecting these dispatchers as
//   different from ContextOnlyDispatcher and other valid dispatchers.
//
// - The `use` hook will change the dispatcher to from a valid update dispatcher
//   to a valid mount dispatcher in some cases. Similarly to useReducer
//   mentioned above, we should not signal that we are exiting a component
//   during this change. Because these other valid dispatchers do not pass the
//   ContextOnlyDispatcher check, they do not affect our logic.
//
// - When server rendering, React does not change the dispatcher before and
//   after each component render. It sets it once for before the first render
//   and once for after the last render. This means that we will not be able to
//   detect when we are entering or exiting a component render. This is fine
//   because we don't need to detect this for server rendering. A component
//   can't trigger async rerenders in SSR so we don't need to track signals.
//
//   If a component updates a signal value while rendering during SSR, we will
//   not rerender the component because the signal value will synchronously
//   change so all reads of the signal further down the tree will see the new
//   value.

/*
Below is a state machine definition for transitions between the various
dispatchers in React's prod build. (It does not include dev time warning
dispatchers which are just always ignored).

ENTER and EXIT suffixes indicates whether this ReactCurrentDispatcher transition
signals we are entering or exiting a component render, or if it doesn't signal a
change in the component rendering lifecyle (NOOP).

```js
// Paste this into https://stately.ai/viz to visualize the state machine.
import { createMachine } from "xstate";

// ENTER, EXIT, NOOP suffixes indicates whether this ReactCurrentDispatcher
// transition signals we are entering or exiting a component render, or
// if it doesn't signal a change in the component rendering lifecyle (NOOP).

const dispatcherMachinePROD = createMachine({
	id: "ReactCurrentDispatcher_PROD",
	initial: "null",
	states: {
		null: {
			on: {
				pushDispatcher: "ContextOnlyDispatcher",
			},
		},
		ContextOnlyDispatcher: {
			on: {
				renderWithHooks_Mount_ENTER: "HooksDispatcherOnMount",
				renderWithHooks_Update_ENTER: "HooksDispatcherOnUpdate",
				pushDispatcher_NOOP: "ContextOnlyDispatcher",
				popDispatcher_NOOP: "ContextOnlyDispatcher",
			},
		},
		HooksDispatcherOnMount: {
			on: {
				renderWithHooksAgain_ENTER: "HooksDispatcherOnRerender",
				resetHooksAfterThrow_EXIT: "ContextOnlyDispatcher",
				finishRenderingHooks_EXIT: "ContextOnlyDispatcher",
			},
		},
		HooksDispatcherOnUpdate: {
			on: {
				renderWithHooksAgain_ENTER: "HooksDispatcherOnRerender",
				resetHooksAfterThrow_EXIT: "ContextOnlyDispatcher",
				finishRenderingHooks_EXIT: "ContextOnlyDispatcher",
				use_ResumeSuspensedMount_NOOP: "HooksDispatcherOnMount",
			},
		},
		HooksDispatcherOnRerender: {
			on: {
				renderWithHooksAgain_ENTER: "HooksDispatcherOnRerender",
				resetHooksAfterThrow_EXIT: "ContextOnlyDispatcher",
				finishRenderingHooks_EXIT: "ContextOnlyDispatcher",
			},
		},
	},
});
```
*/

export let isAutoSignalTrackingInstalled = false;

let store: EffectStore | null = null;
let lock = false;
let currentDispatcher: ReactDispatcher | null = null;

function installCurrentDispatcherHook() {
	isAutoSignalTrackingInstalled = true;

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

			// Update the current dispatcher now so the hooks inside of the
			// useSyncExternalStore shim get the right dispatcher.
			currentDispatcher = nextDispatcher;
			if (
				isEnteringComponentRender(currentDispatcherType, nextDispatcherType)
			) {
				lock = true;
				store = _useSignalsImplementation(1);
				lock = false;
			} else if (
				isRestartingComponentRender(currentDispatcherType, nextDispatcherType)
			) {
				store?.f();
				lock = true;
				store = _useSignalsImplementation(1);
				lock = false;
			} else if (
				isExitingComponentRender(currentDispatcherType, nextDispatcherType)
			) {
				store?.f();
				store = null;
			}
		},
	});
}

type DispatcherType = number;
const ContextOnlyDispatcherType = 1 << 0;
const WarningDispatcherType = 1 << 1;
const MountDispatcherType = 1 << 2;
const UpdateDispatcherType = 1 << 3;
const RerenderDispatcherType = 1 << 4;
const ServerDispatcherType = 1 << 5;
const BrowserClientDispatcherType =
	MountDispatcherType | UpdateDispatcherType | RerenderDispatcherType;

const dispatcherTypeCache = new Map<ReactDispatcher, DispatcherType>();
function getDispatcherType(dispatcher: ReactDispatcher | null): DispatcherType {
	// Treat null the same as the ContextOnlyDispatcher.
	if (!dispatcher) return ContextOnlyDispatcherType;

	const cached = dispatcherTypeCache.get(dispatcher);
	if (cached !== undefined) return cached;

	// The ContextOnlyDispatcher sets all the hook implementations to a function
	// that takes no arguments and throws and error. This dispatcher is the only
	// dispatcher where useReducer and useEffect will have the same
	// implementation.
	let type: DispatcherType;
	const useCallbackImpl = dispatcher.useCallback.toString();
	if (dispatcher.useReducer === dispatcher.useEffect) {
		type = ContextOnlyDispatcherType;

		// @ts-expect-error When server rendering, useEffect and useImperativeHandle
		// are both set to noop functions and so have the same implementation.
	} else if (dispatcher.useEffect === dispatcher.useImperativeHandle) {
		type = ServerDispatcherType;
	} else if (/Invalid/.test(useCallbackImpl)) {
		// We first check for warning dispatchers because they would also pass some
		// of the checks below.
		type = WarningDispatcherType;
	} else if (
		// The development mount dispatcher invokes a function called
		// `mountCallback` whereas the development update/re-render dispatcher
		// invokes a function called `updateCallback`. Use that difference to
		// determine if we are in a mount or update-like dispatcher in development.
		// The production mount dispatcher defines an array of the form [callback,
		// deps] whereas update/re-render dispatchers read the array using array
		// indices (e.g. `[0]` and `[1]`). Use those differences to determine if we
		// are in a mount or update-like dispatcher in production.
		/updateCallback/.test(useCallbackImpl) ||
		(/\[0\]/.test(useCallbackImpl) && /\[1\]/.test(useCallbackImpl))
	) {
		// The update and rerender dispatchers have different implementations for
		// useReducer. We'll check it's implementation to determine if this is the
		// rerender or update dispatcher.
		let useReducerImpl = dispatcher.useReducer.toString();
		if (
			// The development rerender dispatcher invokes a function called
			// `rerenderReducer` whereas the update dispatcher invokes a function
			// called `updateReducer`. The production rerender dispatcher returns an
			// array of the form `[state, dispatch]` whereas the update dispatcher
			// returns an array of `[fiber.memoizedState, dispatch]` so we check the
			// return statement in the implementation of useReducer to differentiate
			// between the two.
			/rerenderReducer/.test(useReducerImpl) ||
			/return\s*\[\w+,/.test(useReducerImpl)
		) {
			type = RerenderDispatcherType;
		} else {
			type = UpdateDispatcherType;
		}
	} else {
		type = MountDispatcherType;
	}

	dispatcherTypeCache.set(dispatcher, type);
	return type;
}

function isEnteringComponentRender(
	currentDispatcherType: DispatcherType,
	nextDispatcherType: DispatcherType
): boolean {
	if (
		currentDispatcherType & ContextOnlyDispatcherType &&
		nextDispatcherType & BrowserClientDispatcherType
	) {
		// ## Mount or update (ContextOnlyDispatcher -> ValidDispatcher (Mount or Update))
		//
		// If the current dispatcher is the ContextOnlyDispatcher and the next
		// dispatcher is a valid dispatcher, we are entering a component render.
		return true;
	} else if (
		currentDispatcherType & WarningDispatcherType ||
		nextDispatcherType & WarningDispatcherType
	) {
		// ## Warning dispatcher
		//
		// If the current dispatcher or next dispatcher is an warning dispatcher,
		// we are not entering a component render. The current warning dispatchers
		// are used to warn when hooks are nested improperly and do not indicate
		// entering a new component render.
		return false;
	} else {
		// ## Resuming suspended mount edge case (Update -> Mount)
		//
		// If we are transitioning from the update dispatcher to the mount
		// dispatcher, then this component is using the `use` hook and is resuming
		// from a mount. We should not re-invoke our hooks in this situation since
		// we are not entering a new component render, but instead continuing a
		// previous render.
		//
		// ## Other transitions
		//
		// For example, Mount -> Mount, Update -> Update, Mount -> Update, any
		// transition in and out of invalid dispatchers.
		//
		// There is no known transition for the following transitions so we default
		// to not triggering a re-enter of the component.
		// - HooksDispatcherOnMount  -> HooksDispatcherOnMount
		// - HooksDispatcherOnMount  -> HooksDispatcherOnUpdate
		// - HooksDispatcherOnUpdate -> HooksDispatcherOnUpdate
		return false;
	}
}

function isRestartingComponentRender(
	currentDispatcherType: DispatcherType,
	nextDispatcherType: DispatcherType
): boolean {
	// A transition from a valid browser dispatcher into the rerender dispatcher
	// is the restart of a component render, so we should end the current
	// component effect and re-invoke our hooks. Details below.
	//
	// ## In-place rerendering (e.g. Mount -> Rerender)
	//
	// If we are transitioning from the mount, update, or rerender dispatcher to
	// the rerender dispatcher (e.g. HooksDispatcherOnMount to
	// HooksDispatcherOnRerender), then this component is rerendering due to
	// calling setState inside of its function body. We are re-entering a
	// component's render method and so we should re-invoke our hooks.

	return Boolean(
		currentDispatcherType & BrowserClientDispatcherType &&
			nextDispatcherType & RerenderDispatcherType
	);
}

/**
 * We are exiting a component render if the current dispatcher is a valid
 * dispatcher and the next dispatcher is the ContextOnlyDispatcher.
 */
function isExitingComponentRender(
	currentDispatcherType: DispatcherType,
	nextDispatcherType: DispatcherType
): boolean {
	return Boolean(
		currentDispatcherType & BrowserClientDispatcherType &&
			nextDispatcherType & ContextOnlyDispatcherType
	);
}

interface JsxRuntimeModule {
	jsx?(type: any, ...rest: any[]): unknown;
	jsxs?(type: any, ...rest: any[]): unknown;
	jsxDEV?(type: any, ...rest: any[]): unknown;
}

export function installJSXHooks() {
	const JsxPro: JsxRuntimeModule = jsxRuntime;
	const JsxDev: JsxRuntimeModule = jsxRuntimeDev;

	/**
	 * createElement _may_ be called by jsx runtime as a fallback in certain cases,
	 * so we need to wrap it regardless.
	 *
	 * The jsx exports depend on the `NODE_ENV` var to ensure the users' bundler doesn't
	 * include both, so one of them will be set with `undefined` values.
	 */
	React.createElement = wrapJsx(React.createElement);
	JsxDev.jsx && /*   */ (JsxDev.jsx = wrapJsx(JsxDev.jsx));
	JsxPro.jsx && /*   */ (JsxPro.jsx = wrapJsx(JsxPro.jsx));
	JsxDev.jsxs && /*  */ (JsxDev.jsxs = wrapJsx(JsxDev.jsxs));
	JsxPro.jsxs && /*  */ (JsxPro.jsxs = wrapJsx(JsxPro.jsxs));
	JsxDev.jsxDEV && /**/ (JsxDev.jsxDEV = wrapJsx(JsxDev.jsxDEV));
	JsxPro.jsxDEV && /**/ (JsxPro.jsxDEV = wrapJsx(JsxPro.jsxDEV));
}

export function installAutoSignalTracking() {
	const [major] = reactVersion.split(".").map(Number);
	if (major >= 19) {
		throw new Error(
			"Automatic signals tracking is not supported in React 19 and later, try the Babel plugin instead https://github.com/preactjs/signals/tree/main/packages/react-transform#signals-react-transform."
		);
	}
	installCurrentDispatcherHook();
	installJSXHooks();
}
