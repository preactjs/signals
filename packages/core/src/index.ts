const SUBS = Symbol.for("subs");
const DEPS = Symbol.for("deps");
const VALUE = Symbol.for("value");
const PENDING = Symbol.for("pending");

let ROOT: Signal;

/** This tracks subscriptions of signals read inside a computed */
let currentSignal: Signal;

const pending = new Set<Signal>();

let oldDeps = new Set<Signal>();

class Signal<T = any> {
	[SUBS] = new Set<Signal>();
	[DEPS] = new Set<Signal>();
	[PENDING] = 0;
	[VALUE]: T;

	constructor(value: T) {
		this[VALUE] = value;
	}

	toString() {
		return "" + this.value;
	}

	get value() {
		// subscribe the current computed to this signal:
		this[SUBS].add(currentSignal);
		// update the current computed's dependencies:
		currentSignal[DEPS].add(this);
		oldDeps.delete(this);
		return this[VALUE];
	}

	set value(value) {
		if (this[VALUE] !== value) {
			this[VALUE] = value;
			let isFirst = pending.size === 0;

			pending.add(this);
			mark(this);

			// this is the first change, not a computed:
			if (isFirst) {
				sweep(pending);
				pending.clear();
			}
		}
	}

	updater() {
		// override me to handle updates
	}
}

function mark(signal: Signal) {
	if (signal[PENDING]++ === 0) {
		signal[SUBS].forEach(mark);
	}
}

function unmark(signal: Signal<any>) {
	if (--signal[PENDING] === 0) {
		signal[SUBS].forEach(unmark);
	}
}

function sweep(subs: Set<Signal<any>>) {
	subs.forEach(signal => {
		if (--signal[PENDING] === 0) {
			signal.updater();
			sweep(signal[SUBS]);
		}
	});
}

function unsubscribe(signal: Signal<any>, from: Signal<any>) {
	signal[DEPS].delete(from);
	from[SUBS].delete(signal);

	// If nobody listens to the signal we depended on, we can traverse
	// upwards and destroy all subscriptions until we encounter a writable
	// signal or a signal that others listen to as well.
	if (from[SUBS].size === 0) {
		from[DEPS].forEach(dep => unsubscribe(from, dep));
	}
}

ROOT = currentSignal = new Signal(undefined);

export function signal<T>(value: T): Signal<T> {
	return new Signal(value);
}

export function computed<T>(compute: () => T): Signal<T> {
	const signal = new Signal<T>(undefined as any);

	function updater() {
		let tmp = currentSignal;
		currentSignal = signal;

		// Computed might conditionally access signals. This means that we need
		// to ensure that we unsubscribe from any old depedencies that aren't
		// used anymore.
		oldDeps = signal[DEPS];
		signal[DEPS] = new Set();

		let ret = compute();
		currentSignal = tmp;

		// Any leftover dependencies here are not needed anymore
		oldDeps.forEach(sub => unsubscribe(signal, sub));
		oldDeps.clear();

		if (signal[VALUE] === ret) {
			signal[SUBS].forEach(unmark);
		} else {
			signal[VALUE] = ret;
		}
	}

	signal.updater = updater;
	updater();

	return signal;
}

export function observe<T>(signal: Signal<T>, callback: (value: T) => void) {
	computed(() => callback(signal.value));
}

function getBackingSignal<T, K>(
	backing: Map<K, Signal>,
	key: K,
	value: T
): Signal<T> {
	let signal = backing.get(key);
	if (!signal) {
		signal = new Signal(value);
		backing.set(key, signal);
	}

	return signal;
}

const REACTIVE = Symbol.for("reactive");
function proxify<T>(value: T): T {
	if (value !== null && typeof value === "object" && !(REACTIVE in value)) {
		return reactive(value as any);
	}

	return value;
}

export function reactive<T extends Record<string, unknown> | Array<any>>(
	original: T
): T {
	const isObject = !Array.isArray(original);
	const backing = new Map<string | symbol, Signal>();
	const proxy = new Proxy(original, {
		get(target, key) {
			if (key === REACTIVE) return true;
			if (key === "__proto__") return;
			if (key === "toString") return original.toString();

			// Special case: Computeds that access object properties before
			// they are set aren't updated if we don't create a signal eagerly.
			// We should definitely discourage this pattern and nudge devs to
			// always initialize all properties upfront.
			if (isObject && !(key in target)) {
				const signal = getBackingSignal(backing, key, undefined);
				return signal.value;
			} else if (!(key in target)) return;

			const targetValue = (target as any)[key];
			// Don't track methods
			if (!original.hasOwnProperty(key)) {
				return targetValue;
			}

			const value = proxify(targetValue);
			const signal = getBackingSignal(backing, key, value);

			return signal.value;
		},
		set(target, key, value) {
			if (key === "__proto__") return true;

			const signal = getBackingSignal(backing, key, value);
			signal.value = proxify(value);
			return Reflect.set(target, key, value);
		},
		deleteProperty: isObject
			? (target, key) => {
					delete (target as any)[key];
					const signal = backing.get(key);
					if (signal) {
						signal.value = undefined;
					}
					return true;
			  }
			: undefined,
	});

	return proxy;
}
