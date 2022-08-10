const SUBS = Symbol.for("subs");
const DEPS = Symbol.for("deps");
const VALUE = Symbol.for("value");

let ROOT: Signal<undefined>;

/** This tracks subscriptions of signals read inside a computed */
let currentSignal: Signal<any>;

class Signal<T> {
	[SUBS]: Set<Signal<any>>;
	[DEPS]: Set<Signal<any>>;
	[VALUE]: T;

	constructor(value: T) {
		this[VALUE] = value;
		this[SUBS] = new Set();
		this[DEPS] = new Set();
	}

	toString() {
		return "" + this.value;
	}

	get value() {
		currentSignal[DEPS].add(this);
		this[SUBS].add(currentSignal);
		return this[VALUE];
	}

	set value(value) {
		if (this[VALUE] !== value) {
			this[VALUE] = value;
			for (const sub of this[SUBS]) {
				sub.updater(this);
			}
		}
	}

	updater(sender: Signal<any>) {
		// override me to handle updates
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
		let ret = compute();
		currentSignal = tmp;

		signal.value = ret;
	}

	signal.updater = updater;
	updater();

	return signal;
}

export function observe<T>(signal: Signal<T>, callback: (value: T) => void) {
	computed(() => callback(signal.value));
}
