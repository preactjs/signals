/** This tracks subscriptions of signals read inside a computed */
let currentSignal: Signal | undefined;
let commitError: Error | null = null;

/** All nodes that requested the update */
const effects = new Set<Signal>();

/** Batch calls can be nested. 0 means that there is no batching */
let batchPending = 0;
/**
 * Subscriptions are set up lazily when a "reactor" is set up.
 * During this activation phase we traverse the graph upwards
 * and refresh all signals that are stale on signal read.
 */
let peeking = false;

let oldDeps = new Map<Signal, number>();

export class Signal<T = any> {
	// These property names get minified - see /mangle.json

	/** @internal Internal, do not use. */
	_subs = new Set<Signal>();
	/** @internal Internal, do not use. */
	_deps = new Map<Signal, number>();
	/** @internal Internal, do not use. */
	_dirty = false;
	/** @internal Internal, do not use. */
	_value: T;
	/** @internal Determine if a computed is allowed to write or not */
	_readonly = false;
	/** @internal Used to detect if there is a cycle in the graph */
	_isComputing = false;
	/** @internal Used to detect if the value changed */
	_version = 0;

	constructor(value: T) {
		this._value = value;
	}

	toString() {
		return "" + this.value;
	}

	peek() {
		console.log("peek", this._dirty, this._version);
		if (this._dirty) {
			let prevCurrent = currentSignal;
			currentSignal = undefined;
			try {
				peeking = true;
				activate(this);
			} finally {
				peeking = false;
				currentSignal = prevCurrent;
			}
		}
		return this._value;
	}

	get value() {
		let prevPeeking = peeking;

		if (this._dirty) {
			activate(this);
		}

		// If we read a signal outside of a computed we have no way
		// to unsubscribe from that. So we assume that the user wants
		// to get the value immediately like for testing.
		if (!currentSignal || peeking) {
			if (!prevPeeking) {
				peeking = false;
			}
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
			mark(this);

			// this is the first change, not a computed and we are not
			// in batch mode:
			if (batchPending === 0) {
				effects.forEach(activate);
				effects.clear();
				if (commitError) {
					const err = commitError;
					// Clear global error flag for next commit
					commitError = null;
					throw err;
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
			if (shouldUnmark) this._subs.forEach(unmark);

			// Any leftover dependencies here are not needed anymore
			if (shouldCleanup) {
				// Unsubscribe from dependencies that were not accessed:
				oldDeps.forEach((_, sub) => unsubscribe(this, sub));
			} else {
				// Re-subscribe to dependencies that not accessed:
				oldDeps.forEach((_, sub) => subscribe(this, sub));
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

function unmark(signal: Signal<any>) {
	// We can only unmark this node as not needing an update if it
	// wasn't flagged as needing an update by someone else. This is
	// done to make the sweeping logic independent of the order
	// in which a dependency tries to unmark a subtree.
	if (signal._dirty) {
		signal._subs.forEach(unmark);
	}
}

function subscribe(signal: Signal<any>, to: Signal<any>) {
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
		from._dirty = true;
		from._version = 0;
		from._deps.forEach((_, dep) => unsubscribe(from, dep));
	}
}

function activate(signal: Signal) {
	if (!signal._dirty) return;

	if (signal._isComputing) {
		throw Error("Cycle detected");
	}

	try {
		if (signal._version > 0) {
			let fresh = true;

			signal._deps.forEach((version, dep) => {
				if (fresh) {
					fresh = dep._version === version;
				}
			});
			if (fresh) return;
		}

		signal._isComputing = true;
		signal._updater();

		if (commitError) {
			const err = commitError;
			commitError = null;
			throw err;
		}
	} finally {
		signal._isComputing = false;
		if (signal._deps.size > 0 || !signal._readonly) {
			signal._dirty = false;
		}
	}
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
	signal._dirty = true;

	function updater() {
		let finish = signal._setCurrent();
		try {
			let ret = compute();
			const didUpdate = signal._value !== ret;
			if (didUpdate) signal._version++;

			finish(!didUpdate, true);
			signal._value = ret;
		} catch (err: any) {
			// Ensure that we log the first error not the last
			if (!commitError) commitError = err;
			finish(true, false);
		}
	}

	signal._updater = updater;

	return signal;
}

export function effect(callback: () => void) {
	const s = computed(() => batch(callback));
	s._dirty = true;
	s.name = "effect";
	// effects.add(s);
	// Set up subscriptions since this is a "reactor" signal
	activate(s);
	return () => s._setCurrent()(true, true);
}

export function batch<T>(cb: () => T): T {
	batchPending++;
	let already = effects.size > 0;
	try {
		return cb();
	} finally {
		if (--batchPending === 0) {
			if (!already) {
				effects.forEach(activate);
				effects.clear();
			}
		}
	}
}
