import { ReadonlySignal, Signal } from "@preact/signals-core";
import { useSignal } from "@preact/signals";
import { Fragment, createElement, ComponentChildren } from "preact";
import { useMemo } from "preact/hooks";

interface ShowProps<T = boolean> {
	when: Signal<T> | ReadonlySignal<T> | (() => T);
	fallback?: ComponentChildren;
	children: ComponentChildren | ((value: NonNullable<T>) => ComponentChildren);
}

const Item = (props: any) => {
	return typeof props.children === "function"
		? props.children(props.v, props.i)
		: props.children;
};

export function Show<T = boolean>(
	props: ShowProps<T>
): ComponentChildren | null {
	const value =
		typeof props.when === "function" ? props.when() : props.when.value;
	if (!value) return props.fallback || null;
	return <Item v={value} children={props.children} />;
}

interface ForProps<T> {
	each:
		| Signal<Array<T>>
		| ReadonlySignal<Array<T>>
		| (() => Signal<Array<T>> | ReadonlySignal<Array<T>>);
	fallback?: ComponentChildren;
	children: (value: T, index: number) => ComponentChildren;
}

export function For<T>(props: ForProps<T>): ComponentChildren | null {
	const cache = useMemo(() => new Map(), []);
	let list = (
		(typeof props.each === "function" ? props.each() : props.each) as Signal<
			Array<T>
		>
	).value;

	if (!list.length) return props.fallback || null;

	const removed = new Set(cache.keys());

	const items = list.map((value, key) => {
		removed.delete(value);
		if (!cache.has(value)) {
			const result = <Item v={value} i={key} children={props.children} />;
			cache.set(value, result);
			return result;
		}
		return cache.get(value);
	});

	removed.forEach(value => {
		cache.delete(value);
	});

	return createElement(Fragment, null, items);
}

export function useLiveSignal<T>(value: T): Signal<T> {
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
