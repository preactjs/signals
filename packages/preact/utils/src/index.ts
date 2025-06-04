import { ReadonlySignal, signal, Signal, effect } from "@preact/signals-core";
import { useSignal } from "@preact/signals";
import { Fragment, createElement, JSX } from "preact";
import { useMemo, useRef, useEffect, useId } from "preact/hooks";

interface ShowProps<T = boolean> {
	when: Signal<T> | ReadonlySignal<T>;
	fallback?: JSX.Element;
	children: JSX.Element | ((value: T) => JSX.Element);
}

export function Show<T = boolean>(props: ShowProps<T>): JSX.Element | null {
	const value = props.when.value;
	if (!value) return props.fallback || null;
	return typeof props.children === "function"
		? props.children(value)
		: props.children;
}

interface ForProps<T> {
	each:
		| Signal<Array<T>>
		| ReadonlySignal<Array<T>>
		| (() => Signal<Array<T>> | ReadonlySignal<Array<T>>);
	fallback?: JSX.Element;
	children: (value: T, index: number) => JSX.Element;
}

export function For<T>(props: ForProps<T>): JSX.Element | null {
	const cache = useMemo(() => new Map(), []);
	let list = (
		(typeof props.each === "function" ? props.each() : props.each) as Signal<
			Array<T>
		>
	).value;

	if (!list.length) return props.fallback || null;

	const items = list.map((value, key) => {
		if (!cache.has(value)) {
			cache.set(value, props.children(value, key));
		}
		return cache.get(value);
	});

	return createElement(Fragment, null, items);
}

export function useLiveSignal<T>(
	value: Signal<T> | ReadonlySignal<T>
): Signal<Signal<T> | ReadonlySignal<T>> {
	const s = useSignal(value);
	if (s.peek() !== value) s.value = value;
	return s;
}

export function useSignalRef<T>(value: T): Signal<T> & { current: T } {
	const ref = useSignal(value) as Signal<T> & { current: T };
	if (!("current" in ref))
		Object.defineProperty(ref, "current", refSignalProto);
	return ref;
}
const refSignalProto = {
	configurable: true,
	get(this: Signal) {
		return this.value;
	},
	set(this: Signal, v: any) {
		this.value = v;
	},
};

/**
 * Represents a Promise with optional value and error properties
 */
interface AugmentedPromise<T> extends Promise<T> {
	value?: T;
	error?: unknown;
}

/**
 * Represents the state and behavior of an async computed value
 */
interface AsyncComputed<T> extends Signal<T> {
	value: T;
	error: Signal<unknown>;
	running: Signal<boolean>;
	pending?: AugmentedPromise<T> | null;
	/** @internal */
	_cleanup(): void;
}

/**
 * Options for configuring async computed behavior
 */
interface AsyncComputedOptions {
	/** Whether to throw pending promises for Suspense support */
	suspend?: boolean;
}

/**
 * Creates a signal that computes its value asynchronously
 * @template T The type of the computed value
 * @param compute Function that returns a Promise or value
 * @returns AsyncComputed signal
 */
export function asyncComputed<T>(
	compute: () => Promise<T> | T
): AsyncComputed<T | undefined> {
	const out = signal<T | undefined>(undefined) as AsyncComputed<T | undefined>;
	out.error = signal<unknown>(undefined);
	out.running = signal<boolean>(false);

	const applyResult = (value: T | undefined, error?: unknown) => {
		if (out.running.value) {
			out.running.value = false;
		}

		if (out.pending) {
			out.pending.error = error;
			out.pending.value = value;
			out.pending = null;
		}

		if (out.error.peek() !== error) {
			out.error.value = error;
		}

		if (out.peek() !== value) {
			out.value = value;
		}
	};

	let computeCounter = 0;

	out._cleanup = effect(() => {
		const currentId = ++computeCounter;

		try {
			const result = compute();

			// Handle synchronous resolution
			if (isPromise(result)) {
				if ("error" in result) {
					return applyResult(undefined, result.error);
				}
				if ("value" in result) {
					return applyResult(result.value as T);
				}

				out.running.value = true;

				// Handle async resolution
				out.pending = result.then(
					(value: T) => {
						if (currentId === computeCounter) {
							applyResult(value);
						}
						return value;
					},
					(error: unknown) => {
						if (currentId === computeCounter) {
							applyResult(undefined, error);
						}
						return undefined;
					}
				) as AugmentedPromise<T>;
			} else {
				out.running.value = false;
				applyResult(result);
			}
		} catch (error) {
			applyResult(undefined, error);
		}
	});

	return out;
}

const ASYNC_COMPUTED_CACHE = new Map<string, AsyncComputed<any>>();

/**
 * Hook for using async computed values with optional Suspense support
 * @template T The type of the computed value
 * @param compute Function that returns a Promise or value
 * @param options Configuration options
 * @returns AsyncComputed signal
 */
export function useAsyncComputed<T>(
	compute: () => Promise<T> | T,
	options: AsyncComputedOptions = {}
): AsyncComputed<T | undefined> {
	const id = useId();
	const computeRef = useRef(compute);
	computeRef.current = compute;

	const result = useMemo(() => {
		const cached = ASYNC_COMPUTED_CACHE.get(id);
		const incoming = asyncComputed(() => computeRef.current());

		if (cached) {
			incoming.running = cached.running;
			incoming.value = cached.value;
			incoming.error.value = cached.error.peek();
			cached._cleanup();
		}

		if (options.suspend !== false) {
			ASYNC_COMPUTED_CACHE.set(id, incoming);
		}

		return incoming;
	}, []);

	useEffect(() => result._cleanup, [result]);

	if (
		options.suspend !== false &&
		result.pending &&
		!result.value &&
		!result.error.value
	) {
		throw result.pending;
	}

	ASYNC_COMPUTED_CACHE.delete(id);
	return result;
}

function isPromise(obj: any): obj is Promise<any> {
	return obj && "then" in obj;
}
