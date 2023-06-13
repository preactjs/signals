import { useRef, useMemo, useEffect, type ReactElement } from "react";
import {
	signal,
	computed,
	batch,
	effect,
	Signal,
	type ReadonlySignal,
} from "@preact/signals-core";
import { installAutoSignalTracking } from "./installAutoSignalTracking";

export { signal, computed, batch, effect, Signal, type ReadonlySignal };

const Empty = [] as const;
const ReactElemType = Symbol.for("react.element"); // https://github.com/facebook/react/blob/346c7d4c43a0717302d446da9e7423a8e28d8996/packages/shared/ReactSymbols.js#L15

installAutoSignalTracking();

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
