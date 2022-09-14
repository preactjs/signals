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

function unsubscribeFromAll(sources: Node | undefined) {
	for (let node = sources; node; node = node.nextSignal) {
		node.signal._unsubscribe(node);
	}
}

type RollbackItem = {
	signal: Signal;
	node: Node;
	next?: RollbackItem;
};

function rollback(item: RollbackItem | undefined) {
	for (let rollback = item; rollback; rollback = rollback.next) {
		rollback.signal._node = rollback.node;
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
	if (batchDepth > 1) {
		batchDepth--;
		return;
	}

	let error: unknown;
	let hasError = false;

	while (currentBatch) {
		const batch = currentBatch;
		currentBatch = undefined;
		batchIteration++;

		for (let item: BatchItem | undefined = batch; item; item = item.next) {
			const runnable = item.effect;
			runnable._batched = false;
			try {
				runnable._notify();
			} catch (err) {
				if (!hasError) {
					error = err;
					hasError = true;
				}
			}
		}
	}
	batchIteration = 0;
	batchDepth--;

	if (hasError) {
		throw error;
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

// A list for rolling back source's ._node values after a target has been evaluated.
let currentRollback: RollbackItem | undefined = undefined;
// Currently evaluated computed or effect.
let evalContext: Computed | Effect | undefined = undefined;
// Used for keeping track whether the current evaluation context should automatically
// subscribe for updates to the signals depends on.
let subscribeDepth = 0;
// Effects collected into a batch.
let currentBatch: BatchItem | undefined = undefined;
let batchDepth = 0;
let batchIteration = 0;
// A global version number for signalss, used for fast-pathing repeated
// computed.peek()/computed.value calls when nothing has changed globally.
let globalVersion = 0;

function getValue<T>(signal: Signal<T>): T {
	let node = signal._node;
	if (evalContext && (!node || node.target !== evalContext)) {
		if (node) {
			currentRollback = { signal: signal, node: node, next: currentRollback };
		}

		node = { signal: signal, nextSignal: evalContext._sources, target: evalContext, version: 0 };
		evalContext._sources = node;
		signal._node = node;

		if (subscribeDepth > 0) {
			signal._subscribe(node);
		}
	} else {
		node = undefined;
	}
	const value = signal.peek();
	if (evalContext && node) {
		node.version = node.signal._version;
	}
	return value;
}

export class Signal<T = any> {
	/** @internal */
	_value: unknown;

	/** @internal */
	_version = 0;

	/** @internal */
	_node?: Node = undefined;

	/** @internal */
	_targets?: Node = undefined;

	constructor(value?: T) {
		this._value = value;
	}

	/** @internal */
	_subscribe(node: Node): void {
		if (this._targets === node || node.prevTarget) {
			return;
		}
		if (this._targets) {
			this._targets.prevTarget = node;
		}
		node.nextTarget = this._targets;
		node.prevTarget = undefined;
		this._targets = node;
	}

	/** @internal */
	_unsubscribe(node: Node): void {
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
			if (batchIteration > 100) {
				throw new Error("Cycle detected");
			}

			this._value = value;
			this._version++;
			globalVersion++;

			/**@__INLINE__*/ startBatch();
			try {
				for (let node = this._targets; node; node = node.nextTarget) {
					node.target._invalidate();
				}
			} finally {
				endBatch();
			}
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
	_compute: () => T;
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
			for (let node = this._sources; node; node = node.nextSignal) {
				node.signal._subscribe(node);
			}
		}
		super._subscribe(node);
	}

	_unsubscribe(node: Node) {
		// When a computed signal loses its last subscriber it also unsubscribes
		// from its own dependencies.
		if (!this._targets) {
			unsubscribeFromAll(this._sources);
		}
		super._unsubscribe(node)
	}

	_invalidate() {
		if (this._valid) {
			this._valid = false;
			for (let node = this._targets; node; node = node.nextTarget) {
				node.target._invalidate();
			}
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

		const targets = this._targets;
		const oldSources = this._sources;
		const prevContext = evalContext;
		const prevRollback = currentRollback;
		try {
			evalContext = this;
			currentRollback = undefined;
			if (targets) {
				// Computed signals with current targets should automatically subscribe to
				// new dependencies it uses in the compute function.
				subscribeDepth++;
			}

			this._sources = undefined;
			this._computing = true;
			value = this._compute();
		} catch (err: unknown) {
			valueIsError = true;
			value = err;
		} finally {
			this._computing = false;

			let node = oldSources;
			while (node) {
				const next = node.nextSignal;
				node.signal._unsubscribe(node);
				node.nextSignal = undefined;
				node = next;
			}
			for (let node = this._sources; node; node = node.nextSignal) {
				node.signal._node = undefined;
			}
			rollback(currentRollback);

			if (targets) {
				subscribeDepth--;
			}
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

	set value(value: T) {
		throw Error("Computed signals are readonly");
	}
}

export interface ReadonlySignal<T = any> extends Signal<T> {
	readonly value: T;
}

export function computed<T>(compute: () => T): ReadonlySignal<T> {
	return new Computed(compute);
}

class Effect {
	_notify: () => void;
	_sources?: Node = undefined;
	_batched = false;

	constructor(notify: () => void) {
		this._notify = notify;
	}

	_start() {
		/*@__INLINE__**/ startBatch();
		const oldSources = this._sources;
		const prevContext = evalContext;
		const prevRollback = currentRollback;

		evalContext = this;
		currentRollback = undefined;
		subscribeDepth++;

		this._sources = undefined;
		return this._end.bind(this, oldSources, prevContext, prevRollback);
	}

	_end(oldSources?: Node, prevContext?: Computed | Effect, prevRollback?: RollbackItem) {
		let node = oldSources;
		while (node) {
			const next = node.nextSignal;
			node.signal._unsubscribe(node);
			node.nextSignal = undefined;
			node = next;
		}
		for (let node = this._sources; node; node = node.nextSignal) {
			node.signal._node = undefined;
		}
		rollback(currentRollback);

		subscribeDepth--;
		evalContext = prevContext;
		currentRollback = prevRollback;
		endBatch();
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
	const effect = new Effect(() => {
		const finish = effect._start();
		try {
			callback.call(effect);
		} finally {
			finish();
		}
	});
	effect._notify();
	// Return a bound function instead of a wrapper like `() => effect._dispose()`,
	// because bound functions seem to be just as fast and take up a lot less memory.
	return effect._dispose.bind(effect);
}
