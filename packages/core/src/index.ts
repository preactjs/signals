// A linked list node used to track dependencies (sources) and dependents (targets).
// Also used to remember the source's last version number that the target saw.
type Node = {
	// A source whose value the target depends on.
	signal: Signal;
	nextSignal?: Node;

	// A target that depends on the source and should be notified when the source changes.
	target: Computed | Effect;
	prevTarget?: Node;
	nextTarget?: Node;

	// The version number of the source that target has last seen. We use version numbers
	// instead of storing the source value, because source values can take arbitrary amount
	// of memory, and computeds could hang on to them forever because they're lazily evaluated.
	version: number;
};

function subscribeToAll(sources: Node | undefined) {
	for (let node = sources; node; node = node.nextSignal) {
		node.signal._subscribe(node);
	}
}

function unsubscribeFromAll(sources: Node | undefined) {
	for (let node = sources; node; node = node.nextSignal) {
		node.signal._unsubscribe(node);
	}
}

type RollbackItem = {
	signal: Signal;
	evalContext?: Computed | Effect | undefined;
	next?: RollbackItem;
};

function rollback(item: RollbackItem | undefined) {
	for (let rollback = item; rollback; rollback = rollback.next) {
		rollback.signal._evalContext = rollback.evalContext;
	}
}

type BatchItem = {
	effect: Effect;
	next?: BatchItem;
};

function startBatch() {
	batchDepth++;
}

function endBatch() {
	if (--batchDepth === 0) {
		const batch = currentBatch;
		currentBatch = undefined;

		for (let item = batch; item; item = item.next) {
			const runnable = item.effect;
			runnable._batched = false;
			runnable._run();
		}
	}
}

export function batch<T>(callback: () => T): T {
	if (batchDepth > 0) {
		return callback();
	}
	/*@__INLINE__**/ startBatch();
	try {
		return callback();
	} finally {
		endBatch();
	}
}

// A list for rolling back source's ._evalContext values after a target has been evaluated.
let currentRollback: RollbackItem | undefined = undefined;
// Currently evaluated computed or effect.
let evalContext: Computed | Effect | undefined = undefined;
// Effects collected into a batch.
let currentBatch: BatchItem | undefined = undefined;
let batchDepth = 0;
// A global version number for signalss, used for fast-pathing repeated
// computed.peek()/computed.value calls when nothing has changed globally.
let globalVersion = 0;

function getValue<T>(signal: Signal<T>): T {
	let node: Node | undefined = undefined;
	if (evalContext !== undefined && signal._evalContext !== evalContext) {
		node = { signal: signal, target: evalContext, version: 0 };
		currentRollback = {
			signal: signal,
			evalContext: signal._evalContext,
			next: currentRollback,
		};
		signal._evalContext = evalContext;
	}
	const value = signal.peek();
	if (evalContext && node) {
		node.nextSignal = evalContext._sources;
		node.version = node.signal._version;
		evalContext._sources = node;
	}
	return value;
}

export class Signal<T = any> {
	/** @internal */
	_value: unknown;

	/** @internal */
	_version = 0;

	/** @internal */
	_evalContext?: Computed | Effect = undefined;

	/** @internal */
	_targets?: Node = undefined;

	constructor(value?: T) {
		this._value = value;
	}

	/** @internal */
	_subscribe(node: Node) {
		if (this._targets) {
			this._targets.prevTarget = node;
		}
		node.nextTarget = this._targets;
		node.prevTarget = undefined;
		this._targets = node;
	}

	/** @internal */
	_unsubscribe(node: Node) {
		const prev = node.prevTarget;
		const next = node.nextTarget;
		node.prevTarget = undefined;
		node.nextTarget = undefined;

		if (prev) {
			prev.nextTarget = next;
		}
		if (next) {
			next.prevTarget = prev;
		}
		if (node === this._targets) {
			this._targets = next;
		}
	}

	subscribe(fn: (value: T) => void): () => void {
		return effect(() => fn(this.value));
	}

	toString(): string {
		return "" + this.value;
	}

	peek(): T {
		return this._value as T;
	}

	get value(): T {
		return getValue(this);
	}

	set value(value: T) {
		if (value !== this._value) {
			this._value = value;
			this._version++;
			globalVersion++;

			/**@__INLINE__*/ startBatch();
			for (let node = this._targets; node; node = node.nextTarget) {
				node.target._invalidate();
			}
			endBatch();
		}
	}
}

export function signal<T>(value: T): Signal<T> {
	return new Signal(value);
}

function returnComputed<T>(computed: Computed<T>): T {
	computed._valid = true;
	computed._globalVersion = globalVersion;
	if (computed._valueIsError) {
		throw computed._value;
	}
	return computed._value as T;
}

export class Computed<T = any> extends Signal<T> {
	_compute?: () => T;
	_sources?: Node = undefined;
	_computing = false;
	_valid = false;
	_valueIsError = false;
	_globalVersion = globalVersion - 1;

	constructor(compute: () => T) {
		super(undefined);
		this._compute = compute;
	}

	_subscribe(node: Node) {
		if (!this._targets) {
			// A computed signal subscribes lazily to its dependencies when
			// the computed signal gets its first subscriber.
			this._valid = false;
			subscribeToAll(this._sources);
		}

		super._subscribe(node);
	}

	_unsubscribe(node: Node) {
		super._unsubscribe(node);

		// When a computed signal loses its last subscriber it also unsubscribes
		// from its own dependencies.
		if (!this._targets) {
			unsubscribeFromAll(this._sources);
		}
	}

	_invalidate() {
		this._valid = false;
		for (let node = this._targets; node; node = node.nextTarget) {
			node.target._invalidate();
		}
	}

	peek(): T {
		if (this._computing) {
			throw new Error("cycle detected");
		}
		if (this._globalVersion === globalVersion) {
			return returnComputed(this);
		}
		if (this._targets && this._valid) {
			return returnComputed(this);
		}

		if (this._version > 0) {
			let node = this._sources;
			while (node) {
				node.signal.peek();
				if (node.signal._version !== node.version) {
					break;
				}
				node = node.nextSignal;
			}
			if (!node) {
				return returnComputed(this);
			}
		}

		let value: unknown = undefined;
		let valueIsError = false;

		const oldSources = this._sources;
		const prevContext = evalContext;
		const prevRollback = currentRollback;
		try {
			evalContext = this;
			currentRollback = undefined;

			this._computing = true;
			this._sources = undefined;

			value = this._compute!();
		} catch (err: unknown) {
			valueIsError = true;
			value = err;
		} finally {
			if (this._targets) {
				subscribeToAll(this._sources);
			}
			unsubscribeFromAll(oldSources);
			rollback(currentRollback);
			this._computing = false;
			evalContext = prevContext;
			currentRollback = prevRollback;
		}

		if (valueIsError || this._valueIsError || this._value !== value) {
			this._value = value;
			this._valueIsError = valueIsError;
			this._version++;
		}
		return returnComputed(this);
	}

	get value(): T {
		return getValue(this);
	}
}

export interface ReadonlySignal<T = any> extends Signal<T> {
	readonly value: T;
}

export function computed<T>(compute: () => T): ReadonlySignal<T> {
	return new Computed(compute);
}

class Effect {
	_sources?: Node = undefined;
	_batched = false;

	constructor(readonly _callback: () => void) { }

	_run() {
		const oldSources = this._sources;
		const prevContext = evalContext;
		const prevRollback = currentRollback;
		try {
			evalContext = this;
			currentRollback = undefined;
			this._sources = undefined;
			this._callback();
		} finally {
			subscribeToAll(this._sources);
			unsubscribeFromAll(oldSources);
			rollback(currentRollback);

			evalContext = prevContext;
			currentRollback = prevRollback;
		}
	}

	_invalidate() {
		if (!this._batched) {
			this._batched = true;
			currentBatch = { effect: this, next: currentBatch };
		}
	}

	_dispose() {
		for (let node = this._sources; node; node = node.nextSignal) {
			node.signal._unsubscribe(node);
		}
		this._sources = undefined;
	}
}

export function effect(callback: () => void): () => void {
	const effect = new Effect(callback);
	effect._run();

	// Return a bound function instead of a wrapper like `() => effect._dispose()`,
	// because bound functions seem to be just as fast and take up a lot less memory.
	return effect._dispose.bind(effect);
}

export function _doNotUseOrYouWillBeFired_notify<S extends Signal>(
	signal: S,
	callback: (signal: S) => void
): () => void {
	const cb = () => callback(signal);
	const notify = new Effect(cb);
	const node = { signal: signal as Signal, target: notify, version: 0 };
	notify._run = cb;
	notify._sources = node;
	signal._subscribe(node);
	return notify._dispose.bind(notify);
}
