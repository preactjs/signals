import {
	useRef,
	useMemo,
	useEffect,
	Component,
	type FunctionComponent,
	type ReactElement,
} from "react";
import React from "react";
import jsxRuntime from "react/jsx-runtime";
import jsxRuntimeDev from "react/jsx-dev-runtime";
import { useSyncExternalStore } from "use-sync-external-store/shim/index.js";
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
const ReactMemoType = Symbol.for("react.memo"); // https://github.com/facebook/react/blob/346c7d4c43a0717302d446da9e7423a8e28d8996/packages/shared/ReactSymbols.js#L30
const ReactForwardRefType = Symbol.for("react.forward_ref"); // https://github.com/facebook/react/blob/346c7d4c43a0717302d446da9e7423a8e28d8996/packages/shared/ReactSymbols.js#L25
const ProxyInstance = new WeakMap<
	FunctionComponent<any>,
	FunctionComponent<any>
>();

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

const SupportsProxy = typeof Proxy === "function";

const ProxyHandlers = {
	/**
	 * This is a function call trap for functional components.
	 * When this is called, we know it means React did run 'Component()',
	 * that means we can use any hooks here to setup our effect and store.
	 *
	 * With the native Proxy, all other calls such as access/setting to/of properties will
	 * be forwarded to the target Component, so we don't need to copy the Component's
	 * own or inherited properties.
	 *
	 * @see https://github.com/facebook/react/blob/2d80a0cd690bb5650b6c8a6c079a87b5dc42bd15/packages/react-reconciler/src/ReactFiberHooks.old.js#L460
	 */
	apply(
		Component: FunctionComponent<any>,
		thisArg: any,
		argumentsList: Parameters<FunctionComponent<any>>
	) {
		const store = useMemo(createEffectStore, Empty);

		useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

		const stop = store.updater._start();

		try {
			const children = Component.apply(thisArg, argumentsList);
			return children;
			// eslint-disable-next-line no-useless-catch
		} catch (e) {
			// Re-throwing promises that'll be handled by suspense
			// or an actual error.
			throw e;
		} finally {
			// Stop effects in either case before return or throw,
			// Otherwise the effect will leak.
			stop();
		}
	},
};

function ProxyFunctionalComponent(Component: FunctionComponent<any>) {
	return ProxyInstance.get(Component) || WrapWithProxy(Component);
}

function WrapWithProxy(Component: FunctionComponent<any>) {
	if (SupportsProxy) {
		const ProxyComponent = new Proxy(Component, ProxyHandlers);

		ProxyInstance.set(Component, ProxyComponent);
		ProxyInstance.set(ProxyComponent, ProxyComponent);

		return ProxyComponent;
	}

	/**
	 * Emulate a Proxy if environment doesn't support it.
	 *
	 * @TODO - unlike Proxy, it's not possible to access the type/Component's
	 * static properties this way. Not sure if we want to copy all statics here.
	 * Omitting this for now.
	 *
	 * @example - works with Proxy, doesn't with wrapped function.
	 * ```
	 * const el = <SomeFunctionalComponent />
	 * el.type.someOwnOrInheritedProperty;
	 * el.type.defaultProps;
	 * ```
	 */
	const WrappedComponent: FunctionComponent<any> = (...args) => {
		return ProxyHandlers.apply(Component, undefined, args);
	};

	ProxyInstance.set(Component, WrappedComponent);
	ProxyInstance.set(WrappedComponent, WrappedComponent);

	return WrappedComponent;
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
 * @see https://reactjs.org/docs/hooks-reference.html#usesyncexternalstore
 * @see https://github.com/reactjs/rfcs/blob/main/text/0214-use-sync-external-store.md
 */
function createEffectStore() {
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
		subscribe(onStoreChange: () => void) {
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

function WrapJsx<T>(jsx: T): T {
	if (typeof jsx !== "function") return jsx;

	return function (type: any, props: any, ...rest: any[]) {
		if (typeof type === "function" && !(type instanceof Component)) {
			return jsx.call(jsx, ProxyFunctionalComponent(type), props, ...rest);
		}

		if (type && typeof type === "object") {
			if (type.$$typeof === ReactMemoType) {
				type.type = ProxyFunctionalComponent(type.type);
				return jsx.call(jsx, type, props, ...rest);
			} else if (type.$$typeof === ReactForwardRefType) {
				type.render = ProxyFunctionalComponent(type.render);
				return jsx.call(jsx, type, props, ...rest);
			}
		}

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
	type: { configurable: true, value: ProxyFunctionalComponent(Text) },
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
