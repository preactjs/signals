import { ReadonlySignal, Signal } from "@preact/signals-core";
import { useSignal } from "@preact/signals-react";
import { useSignals } from "@preact/signals-react/runtime";
import { Fragment, createElement, useMemo, ReactNode } from "react";

interface ShowProps<T = boolean> {
	when: Signal<T> | ReadonlySignal<T> | (() => T);
	fallback?: ReactNode;
	children: ReactNode | ((value: NonNullable<T>) => ReactNode);
}

const Item = (props: any) => {
	useSignals();
	return typeof props.children === "function"
		? props.children(props.v, props.i)
		: props.children;
};

Item.displayName = "Item";

export function Show<T = boolean>(props: ShowProps<T>): JSX.Element | null {
	useSignals();
	const value =
		typeof props.when === "function" ? props.when() : props.when.value;
	if (!value) return (props.fallback as JSX.Element) || null;
	return <Item v={value} children={props.children} />;
}

Show.displayName = "Show";

interface ForProps<T> {
	each:
		| Signal<Array<T>>
		| ReadonlySignal<Array<T>>
		| (() => Signal<Array<T>> | ReadonlySignal<Array<T>>);
	fallback?: ReactNode;
	children: (value: T, index: number) => ReactNode;
}

export function For<T>(props: ForProps<T>): JSX.Element | null {
	useSignals();
	const cache = useMemo(() => new Map(), []);
	let list = (
		(typeof props.each === "function" ? props.each() : props.each) as Signal<
			Array<T>
		>
	).value;

	if (!list.length) return (props.fallback as JSX.Element) || null;

	const removed = new Set(cache.keys());

	const items = list.map((value, key) => {
		removed.delete(value);
		if (!cache.has(value)) {
			const result = (
				<Item v={value} key={key} i={key} children={props.children} />
			);
			cache.set(value, result);
			return result;
		}
		return cache.get(value);
	});

	removed.forEach(value => {
		cache.delete(value);
	});

	return createElement(Fragment, { children: items });
}

For.displayName = "For";

export function useLiveSignal<T>(value: T): Signal<T> {
	const s = useSignal(value);
	if (s.peek() !== value) s.value = value;
	return s;
}

export function useSignalRef<T>(value: T) {
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
