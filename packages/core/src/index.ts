const SUBS = Symbol.for("subs");
const DEPS = Symbol.for("deps");
const VALUE = Symbol.for("value");
const PENDING = Symbol.for("pending");

let ROOT: Signal;

/** This tracks subscriptions of signals read inside a computed */
let currentSignal: Signal;

const pending = new Set<Signal>();

export class Signal<T = any> {
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
		currentSignal[DEPS].add(this);
		this[SUBS].add(currentSignal);
		return this[VALUE];
	}

	set value(value) {
		if (this[VALUE] !== value) {
			this[VALUE] = value;
			let isFirst = pending.size === 0;
			mark(this);
			if (isFirst) sweep();
			// for (const sub of this[SUBS]) {
			// 	sub.updater(this);
			// }
		}
	}

	// updater(sender: Signal) {
	updater() {
		// override me to handle updates
	}
}

function mark(signal: Signal) {
	if (signal[PENDING]++ === 0) {
		pending.add(signal);
	}
	signal[SUBS].forEach(mark);
}

function sweep() {
	pending.forEach(signal => {
		signal[PENDING] = 0;
		signal.updater();
	});
	pending.clear();
}

ROOT = currentSignal = new Signal(undefined);

export function signal<T>(value: T): Signal<T> {
	return new Signal(value);
}

export function computed<T>(compute: () => T): Signal<T> {
	const signal = new Signal<T>(undefined as any);
	let isFirst = true;

	function updater() {
		let tmp = currentSignal;
		currentSignal = signal;
		let ret = compute();
		currentSignal = tmp;

		// the first run of this signal should not fire subscribers
		if (isFirst) signal[VALUE] = ret;
		else signal.value = ret;
	}

	signal.updater = updater;
	updater();
	isFirst = false;

	return signal;
}

export function observe<T>(signal: Signal<T>, callback: (value: T) => void) {
	computed(() => callback(signal.value));
}
