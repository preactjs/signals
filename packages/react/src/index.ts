import {
	useRef,
	useMemo,
	// @ts-ignore-next-line
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED as internals,
} from "react";
import React from "react";
import {
	signal,
	computed,
	batch,
	effect,
	Signal,
	type ReadonlySignal,
} from "@preact/signals-core";
import { Updater, ReactOwner, ReactDispatcher } from "./internal";

export { signal, computed, batch, effect, Signal, type ReadonlySignal };

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

let finishUpdate: ReturnType<Updater["_setCurrent"]> | undefined;
const updaterForComponent = new WeakMap<ReactOwner, Updater>();

function setCurrentUpdater(updater?: Updater) {
	// end tracking for the current update:
	if (finishUpdate) finishUpdate(true, true);
	// start tracking the new update:
	finishUpdate = updater && updater._setCurrent();
}

function createUpdater(updater: () => void) {
	const s = signal(undefined) as Updater;
	s._updater = updater;
	return s;
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
	$$typeof: { value: $$typeof },
	type: { value: Text },
	props: {
		get() {
			return { data: this };
		},
	},
	ref: { value: null },
});

// Track the current owner (roughly equiv to current vnode)
let lastOwner: ReactOwner;
let currentOwner: ReactOwner;
Object.defineProperty(internals.ReactCurrentOwner, "current", {
	get() {
		return currentOwner;
	},
	set(owner) {
		currentOwner = owner;
		if (currentOwner) lastOwner = currentOwner;
	},
});

// Track the current dispatcher (roughly equiv to current component impl)
let lock = false;
const UPDATE = () => ({});
let lastDispatcher: ReactDispatcher;
let currentDispatcher: ReactDispatcher;
Object.defineProperty(internals.ReactCurrentDispatcher, "current", {
	get() {
		return currentDispatcher;
	},
	set(api) {
		currentDispatcher = api;
		if (lock) return;
		if (lastOwner && api && !isInvalidHookAccessor(api)) {
			// prevent re-injecting useReducer when the Dispatcher
			// context changes to run the reducer callback:
			lock = true;
			const rerender = api.useReducer(UPDATE, {})[1];
			lock = false;

			let updater = updaterForComponent.get(lastOwner);
			if (!updater || !lastDispatcher !== api) {
				updater = createUpdater(rerender);
				updaterForComponent.set(lastOwner, updater);
				lastDispatcher = api;
			}
			setCurrentUpdater(updater);
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
		api.useCallback.length < 2 ||
		/warnInvalidHookAccess/.test(api.useCallback as any);
	invalidHookAccessors.set(api, invalid);
	return invalid;
}

export function useSignal<T>(value: T) {
	return useMemo(() => signal<T>(value), []);
}

export function useComputed<T>(compute: () => T) {
	const $compute = useRef(compute);
	$compute.current = compute;
	return useMemo(() => computed<T>(() => $compute.current()), []);
}
