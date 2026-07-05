import { ReadonlySignal, Signal, signal } from "@preact/signals-core";
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
		? props.children(props.v, props.i ? props.i.value : undefined)
		: props.children;
};

Item.displayName = "Item";

export function Show<T = boolean>(
	props: ShowProps<T>
): ComponentChildren | null {
	const value =
		typeof props.when === "function" ? props.when() : props.when.value;
	if (!value) return props.fallback || null;
	return <Item v={value} children={props.children} />;
}

Show.displayName = "Show";

interface ForProps<T> {
	each:
		| Signal<Array<T>>
		| ReadonlySignal<Array<T>>
		| (() => Array<T> | Signal<Array<T>> | ReadonlySignal<Array<T>>);
	fallback?: ComponentChildren;
	getKey?: (item: T, index: number) => string | number;
	children: (value: T, index: number) => ComponentChildren;
}

export function For<T>(props: ForProps<T>): ComponentChildren | null {
	const hasGetKey = !!props.getKey;
	const state = useMemo(
		() => ({ cache: new Map(), nextKey: 0 }),
		// The cache layout differs between keyed and unkeyed mode.
		[hasGetKey]
	);
	const list = (typeof props.each === "function" ? props.each() : props.each) as
		| Signal<Array<T>>
		| Array<T>;

	const listValue = list instanceof Signal ? list.value : list;

	if (!listValue.length) return props.fallback || null;

	const cache = state.cache;
	let items: ComponentChildren[];

	if (props.getKey) {
		// The cache is keyed by the user-provided key, so duplicate or replaced
		// item values with the same key resolve to one stable entry.
		const removed = new Set(cache.keys());
		items = listValue.map((value, index) => {
			const key = props.getKey!(value, index);
			removed.delete(key);
			let entry = cache.get(key);
			if (!entry) {
				const i = signal(index);
				entry = {
					v: value,
					i,
					vnode: <Item key={key} v={value} i={i} children={props.children} />,
				};
				cache.set(key, entry);
			} else {
				if (entry.i.peek() !== index) {
					// Index changed (e.g. an earlier item was removed/reordered). Push
					// the new index through the per-item signal so the cached vnode is
					// reused and the child re-renders reactively instead of being
					// recreated.
					entry.i.value = index;
				}
				if (entry.v !== value) {
					// Same key, new item value: recreate the vnode so the child sees
					// the new value while the stable key preserves DOM identity.
					entry.v = value;
					entry.vnode = (
						<Item key={key} v={value} i={entry.i} children={props.children} />
					);
				}
			}
			return entry.vnode;
		});
		removed.forEach(key => {
			cache.delete(key);
		});
	} else {
		// Without getKey the cache follows item identity so reordered items keep
		// their DOM/state. Duplicate items get one cache entry per occurrence,
		// and keys are minted from a counter so a key is never reused for a
		// different item (a positional key could collide after remove + append).
		const seen = new Map();
		items = listValue.map((value, index) => {
			const occurrence = seen.get(value) || 0;
			seen.set(value, occurrence + 1);
			let entries = cache.get(value);
			if (!entries) cache.set(value, (entries = []));
			let entry = entries[occurrence];
			if (!entry) {
				const i = signal(index);
				entries[occurrence] = entry = {
					i,
					vnode: (
						<Item
							key={state.nextKey++}
							v={value}
							i={i}
							children={props.children}
						/>
					),
				};
			} else if (entry.i.peek() !== index) {
				entry.i.value = index;
			}
			return entry.vnode;
		});
		// Drop cache entries for items (and duplicate occurrences) that left
		// the list.
		cache.forEach((entries, value) => {
			const used = seen.get(value) || 0;
			if (used === 0) cache.delete(value);
			else if (entries.length > used) entries.length = used;
		});
	}

	return createElement(Fragment, null, items);
}

For.displayName = "For";

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
