const ATOM = Symbol.for("atom");

class Atom<T = any> {
	subs = new Set<Atom>();
	deps = new Set<Atom>();
	updater?: () => void;
	constructor(public value: T) {}
}

const ROOT = new Atom(undefined);

/** This tracks subscriptions of signals read inside a computed */
let currentAtom: Atom = ROOT;

function subscribe(atom: Atom) {
	currentAtom.deps.add(atom);
	atom.subs.add(currentAtom);
}

function processUpdate(atom: Atom) {
	for (const sub of atom.subs) {
		sub.updater?.();
	}
}

class Signal<T> {
	[ATOM]: Atom<T>;

	constructor(value: T) {
		this[ATOM] = new Atom(value);
	}

	toString() {
		return this[ATOM].value;
	}

	get value() {
		subscribe(this[ATOM]);
		return this[ATOM].value;
	}

	set value(value) {
		if (this[ATOM].value !== value) {
			this[ATOM].value = value;
			processUpdate(this[ATOM]);
		}
	}
}

export function signal<T>(value: T): Signal<T> {
	return new Signal(value);
}

export function computed<T>(compute: () => T): Signal<T> {
	const signal = new Signal<T>(undefined as any);

	function updater() {
		let tmp = currentAtom;
		currentAtom = signal[ATOM];
		let ret = compute();
		currentAtom = tmp;

		signal.value = ret;
	}

	signal[ATOM].updater = updater;
	updater();

	return signal;
}

export function observe<T>(signal: Signal<T>, callback: (value: T) => void) {
	computed(() => callback(signal.value));
}
