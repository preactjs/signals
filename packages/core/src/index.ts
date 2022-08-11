const SUBS = Symbol.for("subs");
const DEPS = Symbol.for("deps");
const VALUE = Symbol.for("value");
const PENDING = Symbol.for("pending");

const NOOP = () => {};

let ROOT: Signal<undefined>;

/** This tracks subscriptions of signals read inside a computed */
let currentSignal: Signal<any>;

const pending = new Set<Signal<any>>();

let oldDeps = new Set<Signal<any>>();
let activationMode = false;

class Signal<T> {
	[SUBS] = new Set<Signal<any>>();
	[DEPS] = new Set<Signal<any>>();
	[PENDING] = 0;
	[VALUE]: T;
	displayName?: string;

	constructor(value: T) {
		this[VALUE] = value;
	}

	toString() {
		return "" + this.value;
	}

	get value() {
		if (activationMode) {
			currentSignal[DEPS].add(this);
			this[SUBS].add(currentSignal);

			const tmp = currentSignal;
			currentSignal = this;
			if (this.updater !== NOOP && this[DEPS].size === 0) {
				this.updater();
			} else {
				pending.add(this);
			}

			currentSignal = tmp;
		} else {
			currentSignal[DEPS].add(this);
			this[SUBS].add(currentSignal);
			oldDeps.delete(currentSignal);
		}
		return this[VALUE];
	}

	set value(value) {
		if (this[VALUE] !== value) {
			this[VALUE] = value;
			let isFirst = pending.size === 0;

			pending.add(this);
			mark(this);
			if (isFirst) sweep();
		}
	}

	updater = NOOP;
}

function mark(signal: Signal<any>) {
	if (signal[PENDING]++ === 0) {
		console.log("  mark", signal.displayName, signal[PENDING]);
		signal[SUBS].forEach(mark);
	} else {
		console.log("  mark", signal.displayName, signal[PENDING]);
	}
}

function unmark(signal: Signal<any>) {
	if (--signal[PENDING] === 0) {
		signal[SUBS].forEach(unmark);
	}
}

function sweep() {
	const stack = Array.from(pending);
	let signal;
	while ((signal = stack.pop()) !== undefined) {
		console.log("  sweep", signal.displayName, signal[PENDING]);
		if (--signal[PENDING] === 0) {
			signal.updater();
			stack.push(...signal[SUBS]);
		}
	}
	pending.clear();
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
ROOT.displayName = "ROOT";

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
	// updater();

	return signal;
}

export function observe<T>(signal: Signal<T>, callback: (value: T) => void) {
	const s = computed(() => callback(signal.value));
	activationMode = true;
	console.log("  activate", signal.displayName, signal[DEPS].size);
	currentSignal = s;
	s.updater();
	activationMode = false;
	pending.forEach(mark);
	sweep();
	return () => unsubscribe(s, signal);
}
