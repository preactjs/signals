import { ReadonlySignal, Signal } from "@preact/signals-core";
import { useSignal } from "@preact/signals-react";
import { useSignals } from "@preact/signals-react/runtime";
import { Fragment, createElement, useMemo } from "react";

interface ShowProps<T = boolean> {
	when: Signal<T> | ReadonlySignal<T>;
	fallback?: JSX.Element;
	children: JSX.Element | ((value: T) => JSX.Element);
}

export function Show<T = boolean>(props: ShowProps<T>): JSX.Element | null {
	useSignals();
	const value = props.when.value;
	if (!value) return props.fallback || null;
	return typeof props.children === "function"
		? props.children(value)
		: props.children;
}

interface ForProps<T> {
	each: Signal<Array<T>> | ReadonlySignal<Array<T>>;
	fallback?: JSX.Element;
	children: (value: T, index: number) => JSX.Element;
}

export function For<T>(props: ForProps<T>): JSX.Element | null {
	useSignals();
	const cache = useMemo(() => new Map(), []);
	const list = props.each.value;
	if (!list.length) return props.fallback || null;
	const items = list.map((value, key) => {
		if (!cache.has(value)) {
			cache.set(value, props.children(value, key));
		}
		return cache.get(value);
	});
	return createElement(Fragment, { children: items });
}

export function useLiveSignal<T>(value: Signal<T> | ReadonlySignal<T>) {
	const s = useSignal(value);
	if (s.peek() !== value) s.value = value;
	return s;
}
