/** This tracks subscriptions of signals read inside a computed */
let currentSignal: Signal | undefined;

const pending = new Set<Signal>();
const effects = new Set<Signal>();
/** Batch calls can be nested. 0 means that there is no batching */
let batchPending = 0;

let oldDeps = new Map<Signal, number>();

export class Signal<T = any> {
	// These property names get minified - see /mangle.json

	/** @internal Internal, do not use. */
	_subs = new Set<Signal>();
	/** @internal Internal, do not use. */
	_deps = new Map<Signal, number>();
	/** @internal Internal, do not use. */
	_version = 0;
	/** @internal Internal, do not use. */
	_dirty = false;
	/** @internal Internal, do not use. */
	_value: T;
	/** @internal Determine if a computed is allowed to write or not */
	_readonly = false;
	/** @internal Determine if reads should eagerly activate value */
	_active = false;
	/** @internal Used to detect if there is a cycle in the graph */
	_isComputing = false;

	constructor(value: T) {
		this._value = value;
	}

	toString() {
		return "" + this.value;
	}

	peek() {
		if (!this._active) {
			activate(this);
		}
		return this._value;
	}

	get value() {
		if (!this._active) {
			if (!currentSignal) {
				effects.add(this);
			}
			activate(this);
		}

		// If we read a signal outside of a computed we have no way
		// to unsubscribe from that. So we assume that the user wants
		// to get the value immediately like for testing.
		if (!currentSignal) {
			return this._value;
		}

		// subscribe the current computed to this signal:
		this._subs.add(currentSignal);
		// update the current computed's dependencies:
		currentSignal._deps.set(this, this._version);
		oldDeps.delete(this);

		return this._value;
	}

	set value(value) {
		if (this._readonly) {
			throw Error("Computed signals are readonly");
		}

		if (this._value !== value) {
			this._version++;
			this._value = value;
			let isFirst = pending.size === 0;

			pending.add(this);
			// in batch mode this signal may be marked already
			if (!this._dirty) {
				mark(this);
			}

			// this is the first change, not a computed and we are not
			// in batch mode:
			if (isFirst && batchPending === 0) {
				try {
					effects.forEach(signal => activate(signal));
				} finally {
					pending.forEach(signal => (signal._dirty = false));
					pending.clear();
				}
			}
		}
	}

	/**
	 * Start a read operation where this signal is the "current signal" context.
	 * Returns a function that must be called to end the read context.
	 * @internal
	 */
	_setCurrent() {
		let prevSignal = currentSignal;
		let prevOldDeps = oldDeps;
		currentSignal = this;
		oldDeps = this._deps;
		this._deps = new Map();

		return (shouldUnmark: boolean, shouldCleanup: boolean) => {
			// Any leftover dependencies here are not needed anymore
			if (shouldCleanup) {
				// Unsubscribe from dependencies that were not accessed:
				oldDeps.forEach((_, dep) => unsubscribe(this, dep));
			} else {
				// Re-subscribe to dependencies that not accessed:
				oldDeps.forEach((_, dep) => subscribe(this, dep));
			}

			oldDeps.clear();
			oldDeps = prevOldDeps;
			currentSignal = prevSignal;
		};
	}

	/**
	 * A custom update routine to run when this Signal's value changes.
	 * @internal
	 */
	_updater() {
		// override me to handle updates
	}
}

function mark(signal: Signal) {
	if (!signal._dirty) {
		signal._dirty = true;
		if (signal._subs.size === 0) {
			effects.add(signal);
		} else {
			signal._subs.forEach(mark);
		}
	}
}

function subscribe(signal: Signal<any>, to: Signal<any>) {
	signal._active = true;
	signal._deps.set(to, to._version);
	to._subs.add(signal);
}

function unsubscribe(signal: Signal<any>, from: Signal<any>) {
	signal._deps.delete(from);
	from._subs.delete(signal);

	// If nobody listens to the signal we depended on, we can traverse
	// upwards and destroy all subscriptions until we encounter a writable
	// signal or a signal that others listen to as well.
	if (from._subs.size === 0) {
		from._active = false;
		from._deps.forEach((_, dep) => unsubscribe(from, dep));
	}
}

/**
 * Refresh _just_ this signal and its dependencies recursively.
 * All other signals will be left untouched and added to the
 * global queue to flush later. Since we're traversing "upwards",
 * we don't have to care about topological sorting.
 */
function refreshStale(signal: Signal) {
	const first = signal._deps.size === 0;

	let shouldUpdate = false;
	if (signal._dirty) {
		signal._deps.forEach((version, dep) => {
			if (dep._dirty) {
				refreshStale(dep);
			}

			if (dep._version !== version) {
				shouldUpdate = true;
				signal._deps.set(dep, dep._version);
			}
		});
	}

	effects.delete(signal);
	signal._dirty = false;

	if (first || shouldUpdate) {
		signal._updater();
	}
}

function activate(signal: Signal) {
	signal._active = true;
	refreshStale(signal);
}

export function signal<T>(value: T): Signal<T> {
	return new Signal(value);
}

export type ReadonlySignal<T = any> = Omit<Signal<T>, "value"> & {
	readonly value: T;
};
export function computed<T>(compute: () => T): ReadonlySignal<T> {
	const signal = new Signal<T>(undefined as any);
	signal._readonly = true;

	function updater() {
		let finish = signal._setCurrent();

		try {
			if (signal._isComputing) {
				throw new Error("Cycle detected");
			}

			signal._isComputing = true;
			let ret = compute();

			const stale = signal._value === ret;
			if (!stale) signal._version++;
			finish(stale, true);
			signal._value = ret;
		} finally {
			signal._isComputing = false;
			finish(true, false);
		}
	}

	signal._updater = updater;

	return signal;
}

export function effect(callback: () => void) {
	const s = computed(() => batch(callback));
	// Set up subscriptions since this is a "reactor" signal
	activate(s);
	return () => s._setCurrent()(true, true);
}

export function batch<T>(cb: () => T): T {
	batchPending++;
	try {
		return cb();
	} finally {
		if (--batchPending === 0) {
			try {
				effects.forEach(signal => activate(signal));
			} finally {
				pending.forEach(signal => (signal._dirty = false));
				pending.clear();
			}
		}
	}
}
