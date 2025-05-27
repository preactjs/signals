import { ReadonlySignal, Signal } from "@preact/signals-core";
import { useSignal } from "@preact/signals";
import { Fragment, createElement, JSX } from "preact";
import { useMemo } from "preact/hooks";

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
