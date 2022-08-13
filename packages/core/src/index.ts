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
	backing: Record<string, Signal> | Signal[],
	key: K,
	value: T
): Signal<T> {
	return (backing as any)[key] || ((backing as any)[key] = new Signal(value));
}

const REACTIVE = Symbol.for("reactive");
function proxify<T>(value: T): T {
	if (value !== null && typeof value === "object" && !(REACTIVE in value)) {
		return reactive(value as any);
	}

	return value;
}

export function proxySet<T extends Set<any>>(
	original: T,
	ownSignal: Signal
): T {
	const backing = new Map<any, Signal>(
		Array.from(original.entries()).map(entry => {
			entry[1] = new Signal(entry[0]);
			return entry;
		})
	);
	const sizeSignal = new Signal(original.size);

	const methodCache: Record<string | symbol, any> = {};

	const handler = {
		[Symbol.iterator]: () => {
			let i = 0;
			ownSignal.value;
			const items = Array.from(backing.values());
			return {
				next() {
					const done = i >= items.length;
					const value = !done ? items[i][VALUE] : undefined;
					i++;
					return { value, done };
				},
			};
		},
		get size() {
			return sizeSignal.value;
		},
		values() {
			ownSignal.value;
			return original.values();
		},
		entries() {
			ownSignal.value;
			return original.entries();
		},
		keys() {
			ownSignal.value;
			return original.keys();
		},
		has(value: T) {
			ownSignal.value;
			return original.has(value);
		},
		clear() {
			original.clear();
			sizeSignal.value = 0;
			ownSignal.value = NaN;
			return handler;
		},
		forEach(fn: any) {
			ownSignal.value;
			return original.forEach(fn);
		},
		add(value: T) {
			if (!original.has(value)) {
				original.add(value);
				backing.set(value, new Signal(value));
				sizeSignal.value++;
				ownSignal.value = NaN;
			}
		},
		delete(value: T) {
			const signal = backing.get(value);
			if (signal) {
				// FIXME: Unsubscribe
				signal[DEPS].forEach(dep => unsubscribe(signal, dep));
				original.delete(value);
				backing.delete(value);
				sizeSignal.value--;
				ownSignal.value = NaN;
			}
		},
	};

	return new Proxy(original, {
		get(target, key) {
			return (
				handler[key] ||
				methodCache[key] ||
				(methodCache[key] = (target as any)[key].bind(target))
			);
		},
		ownKeys(target) {
			// Record dependency on whole object shape. Happens in
			// for, for-in or for-of loops.
			ownSignal.value;
			return Reflect.ownKeys(target);
		},
	});
}

export function reactive<
	T extends Record<string, unknown> | Array<any> | Set<any> | Map<any, any>
>(original: T): T {
	const ownSignal = new Signal(NaN);
	if (original instanceof Set) {
		return proxySet(original, ownSignal);
	}
	const isObject = !Array.isArray(original);
	const backing: Record<string | symbol, Signal> = {};

	const proxy = new Proxy(original, {
		get(target, key) {
			// console.log("get", key, target, receiver);
			if (key === REACTIVE) return true;
			if (key === "__proto__") return;
			if (key === "toString") return original.toString;

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
			(target as any)[key] = value;

			// Update subscriptions that depend on the whole object
			ownSignal.value = NaN;
			return true;
		},
		ownKeys(target) {
			// Record dependency on whole object shape. Happens in
			// for, for-in or for-of loops.
			ownSignal.value;
			return Reflect.ownKeys(target);
		},
		deleteProperty: isObject
			? (target, key) => {
					delete (target as any)[key];
					const signal = backing[key];
					if (signal) {
						signal.value = undefined;
					}
					// Update subscriptions that depend on the whole object
					ownSignal.value = NaN;
					return true;
			  }
			: undefined,
	});

	return proxy;
}
