function cycleDetected() {
	throw new Error("Cycle detected");
}

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

	// Whether the target is currently depending the signal.
	used: boolean;

	// Used to remember & roll back signal's previous `._node` value when entering & exiting
	// a new evaluation context.
	rollbackNode?: Node;
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

	while (batchedEffect !== undefined) {
		let effect: Effect | undefined = batchedEffect;
		batchedEffect = undefined;

		batchIteration++;

		while (effect !== undefined) {
			const next: Effect | undefined = effect._nextEffect;
			effect._nextEffect = undefined;
			effect._notified = false;
			try {
				effect._callback();
			} catch (err) {
				if (!hasError) {
					error = err;
					hasError = true;
				}
			}
			effect = next;
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

// Currently evaluated computed or effect.
let evalContext: Computed | Effect | undefined = undefined;
// Used for keeping track whether the current evaluation context should automatically
// subscribe for updates to the signals depends on.
let subscribeDepth = 0;
// Effects collected into a batch.
let batchedEffect: Effect | undefined = undefined;
let batchDepth = 0;
let batchIteration = 0;
// A global version number for signalss, used for fast-pathing repeated
// computed.peek()/computed.value calls when nothing has changed globally.
let globalVersion = 0;

function getValue<T>(signal: Signal<T>): T {
	let node: Node | undefined = undefined;
	if (evalContext !== undefined) {
		node = signal._node;
		if (node === undefined || node.target !== evalContext) {
			node = { signal: signal, nextSignal: evalContext._sources, target: evalContext, version: 0, used: true, rollbackNode: node };
			evalContext._sources = node;
			signal._node = node;

			if (subscribeDepth > 0) {
				signal._subscribe(node);
			}
		} else if (!node.used) {
			node.used = true;
		} else {
			node = undefined;
		}
	}
	try {
		return signal.peek();
	} finally {
		if (node !== undefined) {
			node.version = signal._version;
		}
	}
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
		if (this._targets !== undefined) {
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
		if (prev !== undefined) {
			prev.nextTarget = next;
		}
		if (next !== undefined) {
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
				cycleDetected();
			}

			this._value = value;
			this._version++;
			globalVersion++;

			/**@__INLINE__*/ startBatch();
			try {
				for (let node = this._targets; node !== undefined; node = node.nextTarget) {
					node.target._notify();
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

function prepareSources(target: Computed | Effect) {
	for (let node = target._sources; node !== undefined; node = node.nextSignal) {
		const rollbackNode = node.signal._node;
		if (rollbackNode !== undefined) {
			node.rollbackNode = rollbackNode;
		}
		node.signal._node = node;
		node.used = false;
	}
}

function cleanupSources(target: Computed | Effect) {
	let sources = undefined;
	let node = target._sources;
	while (node !== undefined) {
		const next = node.nextSignal;
		if (node.used) {
			node.nextSignal = sources;
			sources = node;
		} else {
			node.signal._unsubscribe(node);
			node.nextSignal = undefined;
		}

		node.signal._node = node.rollbackNode;
		if (node.rollbackNode !== undefined) {
			node.rollbackNode = undefined;
		}
		node = next;
	}
	target._sources = sources;
}

function returnComputed<T>(computed: Computed<T>): T {
	computed._running = false;
	if (computed._valueIsError) {
		throw computed._value;
	}
	return computed._value as T;
}

export class Computed<T = any> extends Signal<T> {
	_compute: () => T;
	_sources?: Node = undefined;
	_running = false;
	_stale = true;
	_notified = false;
	_valueIsError = false;
	_globalVersion = globalVersion - 1;

	constructor(compute: () => T) {
		super(undefined);
		this._compute = compute;
	}

	_subscribe(node: Node) {
		if (this._targets === undefined) {
			this._stale = true;

			// A computed signal subscribes lazily to its dependencies when the computed
			// signal gets its first subscriber.
			for (let node = this._sources; node !== undefined; node = node.nextSignal) {
				node.signal._subscribe(node);
			}
		}
		super._subscribe(node);
	}

	_unsubscribe(node: Node) {
		super._unsubscribe(node)

		// When a computed signal loses its last subscriber it also unsubscribes
		// from its own dependencies.
		if (this._targets === undefined) {
			for (let node = this._sources; node !== undefined; node = node.nextSignal) {
				node.signal._unsubscribe(node);
			}
		}
	}

	_notify() {
		if (!this._notified) {
			this._notified = true;
			this._stale = true;

			for (let node = this._targets; node !== undefined; node = node.nextTarget) {
				node.target._notify();
			}
		}
	}

	peek(): T {
		this._notified = false;

		if (this._running) {
			cycleDetected();
		}
		this._running = true;

		if (!this._stale && this._targets !== undefined) {
			return returnComputed(this);
		}
		this._stale = false;

		if (this._globalVersion === globalVersion) {
			return returnComputed(this);
		}
		this._globalVersion = globalVersion;

		if (this._version > 0) {
			let node = this._sources;
			while (node !== undefined) {
				try {
					node.signal.peek();
				} catch {
					// Failures of previous dependencies shouldn't be rethrown here
					// in case they're not dependencies anymore.
				}
				if (node.signal._version !== node.version) {
					break;
				}
				node = node.nextSignal;
			}
			if (node === undefined) {
				return returnComputed(this);
			}
		}

		let value: unknown = undefined;
		let valueIsError = false;

		const targets = this._targets;
		const prevContext = evalContext;
		try {
			evalContext = this;
			if (targets !== undefined) {
				// Computed signals with current targets should automatically subscribe to
				// new dependencies it uses in the compute function.
				subscribeDepth++;
			}
			prepareSources(this);

			value = this._compute();
		} catch (err) {
			valueIsError = true;
			value = err;
		} finally {
			cleanupSources(this);
			if (targets !== undefined) {
				subscribeDepth--;
			}
			evalContext = prevContext;
		}

		if (valueIsError || this._valueIsError || this._value !== value || this._version === 0) {
			this._value = value;
			this._valueIsError = valueIsError;
			this._version++;
		}
		return returnComputed(this);
	}

	get value(): T {
		if (this._running) {
			cycleDetected();
		}
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

function endEffect(this: Effect, prevContext?: Computed | Effect) {
	cleanupSources(this);

	subscribeDepth--;
	evalContext = prevContext;
	endBatch();

	this._running = false;
}

class Effect {
	_callback: () => void;
	_sources?: Node = undefined;
	_running = false;
	_notified = false;
	_nextEffect?: Effect = undefined;

	constructor(callback: () => void) {
		this._callback = callback;
	}

	_start() {
		if (this._running) {
			cycleDetected();
		}
		this._running = true;

		/*@__INLINE__**/ startBatch();
		const prevContext = evalContext;

		evalContext = this;
		subscribeDepth++;

		prepareSources(this);
		return endEffect.bind(this, prevContext);
	}

	_notify() {
		if (!this._notified) {
			this._notified = true;
			this._nextEffect = batchedEffect;
			batchedEffect = this;
		}
	}

	_dispose() {
		for (let node = this._sources; node !== undefined; node = node.nextSignal) {
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
	effect._callback();
	// Return a bound function instead of a wrapper like `() => effect._dispose()`,
	// because bound functions seem to be just as fast and take up a lot less memory.
	return effect._dispose.bind(effect);
}
