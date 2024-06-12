import {
	signal,
	computed,
	effect,
	Signal,
	ReadonlySignal,
} from "@preact/signals-core";
import { useRef, useMemo, useEffect, useLayoutEffect } from "react";
import { useSyncExternalStore } from "use-sync-external-store/shim/index.js";
import { isAutoSignalTrackingInstalled } from "./auto";

export { installAutoSignalTracking } from "./auto";

const Empty = [] as const;
const ReactElemType = Symbol.for("react.element"); // https://github.com/facebook/react/blob/346c7d4c43a0717302d446da9e7423a8e28d8996/packages/shared/ReactSymbols.js#L15
const noop = () => {};

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

const symDispose: unique symbol =
	(Symbol as any).dispose || Symbol.for("Symbol.dispose");

interface Effect {
	_sources: object | undefined;
	_start(): () => void;
	_callback(): void;
	_dispose(): void;
}

/**
 * Use this flag to represent a bare `useSignals` call that doesn't manually
 * close its effect store and relies on auto-closing when the next useSignals is
 * called or after a microtask
 */
const UNMANAGED = 0;
/**
 * Use this flag to represent a `useSignals` call that is manually closed by a
 * try/finally block in a component's render method. This is the default usage
 * that the react-transform plugin uses.
 */
const MANAGED_COMPONENT = 1;
/**
 * Use this flag to represent a `useSignals` call that is manually closed by a
 * try/finally block in a hook body. This is the default usage that the
 * react-transform plugin uses.
 */
const MANAGED_HOOK = 2;

/**
 * An enum defining how this store is used. See the documentation for each enum
 * member for more details.
 * @see {@link UNMANAGED}
 * @see {@link MANAGED_COMPONENT}
 * @see {@link MANAGED_HOOK}
 */
type EffectStoreUsage =
	| typeof UNMANAGED
	| typeof MANAGED_COMPONENT
	| typeof MANAGED_HOOK;

export interface EffectStore {
	/**
	 * An enum defining how this hook is used and whether it is invoked in a
	 * component's body or hook body. See the comment on `EffectStoreUsage` for
	 * more details.
	 */
	readonly _usage: EffectStoreUsage;
	readonly effect: Effect;
	subscribe(onStoreChange: () => void): () => void;
	getSnapshot(): number;
	/** startEffect - begin tracking signals used in this component */
	_start(): void;
	/** finishEffect - stop tracking the signals used in this component */
	f(): void;
	[symDispose](): void;
}

let currentStore: EffectStore | undefined;

function startComponentEffect(
	prevStore: EffectStore | undefined,
	nextStore: EffectStore
) {
	const endEffect = nextStore.effect._start();
	currentStore = nextStore;

	return finishComponentEffect.bind(nextStore, prevStore, endEffect);
}

function finishComponentEffect(
	this: EffectStore,
	prevStore: EffectStore | undefined,
	endEffect: () => void
) {
	endEffect();
	currentStore = prevStore;
}

/**
 * A redux-like store whose store value is a positive 32bit integer (a
 * 'version').
 *
 * React subscribes to this store and gets a snapshot of the current 'version',
 * whenever the 'version' changes, we tell React it's time to update the
 * component (call 'onStoreChange').
 *
 * How we achieve this is by creating a binding with an 'effect', when the
 * `effect._callback' is called, we update our store version and tell React to
 * re-render the component ([1] We don't really care when/how React does it).
 *
 * [1]
 * @see https://react.dev/reference/react/useSyncExternalStore
 * @see
 * https://github.com/reactjs/rfcs/blob/main/text/0214-use-sync-external-store.md
 *
 * @param _usage An enum defining how this hook is used and whether it is
 * invoked in a component's body or hook body. See the comment on
 * `EffectStoreUsage` for more details.
 */
function createEffectStore(_usage: EffectStoreUsage): EffectStore {
	let effectInstance!: Effect;
	let endEffect: (() => void) | undefined;
	let version = 0;
	let onChangeNotifyReact: (() => void) | undefined;

	let unsubscribe = effect(function (this: Effect) {
		effectInstance = this;
	});
	effectInstance._callback = function () {
		version = (version + 1) | 0;
		if (onChangeNotifyReact) onChangeNotifyReact();
	};

	return {
		_usage,
		effect: effectInstance,
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
		_start() {
			// In general, we want to support two kinds of usages of useSignals:
			//
			// A) Managed: calling useSignals in a component or hook body wrapped in a
			//    try/finally (like what the react-transform plugin does)
			//
			// B) Unmanaged: Calling useSignals directly without wrapping in a
			//    try/finally
			//
			// For managed, we finish the effect in the finally block of the component
			// or hook body. For unmanaged, we finish the effect in the next
			// useSignals call or after a microtask.
			//
			// There are different tradeoffs which each approach. With managed, using
			// a try/finally ensures that only signals used in the component or hook
			// body are tracked. However, signals accessed in render props are missed
			// because the render prop is invoked in another component that may or may
			// not realize it is rendering signals accessed in the render prop it is
			// given.
			//
			// The other approach is "unmanaged": to call useSignals directly without
			// wrapping in a try/finally. This approach is easier to manually write in
			// situations where a build step isn't available but does open up the
			// possibility of catching signals accessed in other code before the
			// effect is closed (e.g. in a layout effect). Most situations where this
			// could happen are generally consider bad patterns or bugs. For example,
			// using a signal in a component and not having a call to `useSignals`
			// would be an bug. Or using a signal in `useLayoutEffect` is generally
			// not recommended since that layout effect won't update when the signals'
			// value change.
			//
			// To support both approaches, we need to track how each invocation of
			// useSignals is used, so we can properly transition between different
			// kinds of usages.
			//
			// The following table shows the different scenarios and how we should
			// handle them.
			//
			// Key:
			// 0 = UNMANAGED
			// 1 = MANAGED_COMPONENT
			// 2 = MANAGED_HOOK
			//
			// Pattern:
			// prev store usage -> this store usage: action to take
			//
			// - 0 -> 0: finish previous effect (unknown to unknown)
			//
			//   We don't know how the previous effect was used, so we need to finish
			//   it before starting the next effect.
			//
			// - 0 -> 1: finish previous effect
			//
			//   Assume previous invocation was another component or hook from another
			//   component. Nested component renders (renderToStaticMarkup within a
			//   component's render) won't be supported with bare useSignals calls.
			//
			// - 0 -> 2: capture & restore
			//
			//   Previous invocation could be a component or a hook. Either way,
			//   restore it after our invocation so that it can continue to capture
			//   any signals after we exit.
			//
			// - 1 -> 0: Do nothing. Signals already captured by current effect store
			// - 1 -> 1: capture & restore (e.g. component calls renderToStaticMarkup)
			// - 1 -> 2: capture & restore (e.g. hook)
			//
			// - 2 -> 0: Do nothing. Signals already captured by current effect store
			// - 2 -> 1: capture & restore (e.g. hook calls renderToStaticMarkup)
			// - 2 -> 2: capture & restore (e.g. nested hook calls)

			if (currentStore == undefined) {
				endEffect = startComponentEffect(undefined, this);
				return;
			}

			const prevUsage = currentStore._usage;
			const thisUsage = this._usage;

			if (
				(prevUsage == UNMANAGED && thisUsage == UNMANAGED) || // 0 -> 0
				(prevUsage == UNMANAGED && thisUsage == MANAGED_COMPONENT) // 0 -> 1
			) {
				// finish previous effect
				currentStore.f();
				endEffect = startComponentEffect(undefined, this);
			} else if (
				(prevUsage == MANAGED_COMPONENT && thisUsage == UNMANAGED) || // 1 -> 0
				(prevUsage == MANAGED_HOOK && thisUsage == UNMANAGED) // 2 -> 0
			) {
				// Do nothing since it'll be captured by current effect store
			} else {
				// nested scenarios, so capture and restore the previous effect store
				endEffect = startComponentEffect(currentStore, this);
			}
		},
		f() {
			const end = endEffect;
			endEffect = undefined;
			end?.();
		},
		[symDispose]() {
			this.f();
		},
	};
}

function createEmptyEffectStore(): EffectStore {
	return {
		_usage: UNMANAGED,
		effect: {
			_sources: undefined,
			_callback() {},
			_start() {
				return noop;
			},
			_dispose() {},
		},
		subscribe() {
			return noop;
		},
		getSnapshot() {
			return 0;
		},
		_start() {},
		f() {},
		[symDispose]() {},
	};
}

const emptyEffectStore = createEmptyEffectStore();

const _queueMicroTask = Promise.prototype.then.bind(Promise.resolve());

let finalCleanup: Promise<void> | undefined;
export function ensureFinalCleanup() {
	if (!finalCleanup) {
		finalCleanup = _queueMicroTask(cleanupTrailingStore);
	}
}
function cleanupTrailingStore() {
	finalCleanup = undefined;
	currentStore?.f();
}

/**
 * Custom hook to create the effect to track signals used during render and
 * subscribe to changes to rerender the component when the signals change.
 */
export function _useSignalsImplementation(
	_usage: EffectStoreUsage = UNMANAGED
): EffectStore {
	ensureFinalCleanup();

	const storeRef = useRef<EffectStore>();
	if (storeRef.current == null) {
		storeRef.current = createEffectStore(_usage);
	}

	const store = storeRef.current;
	useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
	store._start();
	// note: _usage is a constant here, so conditional is okay
	if (_usage === UNMANAGED) useLayoutEffect(cleanupTrailingStore);

	return store;
}

/**
 * A wrapper component that renders a Signal's value directly as a Text node or JSX.
 */
function SignalValue({ data }: { data: Signal }) {
	const store = _useSignalsImplementation(1);
	try {
		return data.value;
	} finally {
		store.f();
	}
}

// Decorate Signals so React renders them as <SignalValue> components.
Object.defineProperties(Signal.prototype, {
	$$typeof: { configurable: true, value: ReactElemType },
	type: { configurable: true, value: SignalValue },
	props: {
		configurable: true,
		get() {
			return { data: this };
		},
	},
	ref: { configurable: true, value: null },
});

export function useSignals(usage?: EffectStoreUsage): EffectStore {
	if (isAutoSignalTrackingInstalled) return emptyEffectStore;
	return _useSignalsImplementation(usage);
}

export function useSignal<T>(value: T): Signal<T> {
	return useMemo(() => signal<T>(value), Empty);
}

export function useComputed<T>(compute: () => T): ReadonlySignal<T> {
	const $compute = useRef(compute);
	$compute.current = compute;
	return useMemo(() => computed<T>(() => $compute.current()), Empty);
}

export function useSignalEffect(cb: () => void | (() => void)): void {
	const callback = useRef(cb);
	callback.current = cb;

	useEffect(() => {
		return effect(() => callback.current());
	}, Empty);
}
