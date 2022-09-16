function cycleDetected(): never {
	throw new Error("Cycle detected");
}

const RUNNING = 1 << 0;
const STALE = 1 << 1;
const NOTIFIED = 1 << 2;
const HAS_ERROR = 1 << 3;
const SHOULD_SUBSCRIBE = 1 << 4;
const SUBSCRIBED = 1 << 5;
const DISPOSED = 1 << 6;

// A linked list node used to track dependencies (sources) and dependents (targets).
// Also used to remember the source's last version number that the target saw.
type Node = {
	// A node may have the following flags:
	//  SUBSCRIBED when the target has subscribed to listen change notifications from the source
	//  STALE when it's unclear whether the source is still a dependency of the target
	_flags: number;

	// A source whose value the target depends on.
	_source: Signal;
	_prevSource?: Node;
	_nextSource?: Node;

	// A target that depends on the source and should be notified when the source changes.
	_target: Computed | Effect;
	_prevTarget?: Node;
	_nextTarget?: Node;

	// The version number of the source that target has last seen. We use version numbers
	// instead of storing the source value, because source values can take arbitrary amount
	// of memory, and computeds could hang on to them forever because they're lazily evaluated.
	_version: number;

	// Used to remember & roll back the source's previous `._node` value when entering &
	// exiting a new evaluation context.
	_rollbackNode?: Node;
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
			const next: Effect | undefined = effect._nextBatchedEffect;
			effect._nextBatchedEffect = undefined;
			effect._flags &= ~NOTIFIED;

			if (!(effect._flags & DISPOSED)) {
				try {
					effect._callback();
				} catch (err) {
					if (!hasError) {
						error = err;
						hasError = true;
					}
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

function batch<T>(callback: () => T): T {
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

// Effects collected into a batch.
let batchedEffect: Effect | undefined = undefined;
let batchDepth = 0;
let batchIteration = 0;

// A global version number for signals, used for fast-pathing repeated
// computed.peek()/computed.value calls when nothing has changed globally.
let globalVersion = 0;

function getValue<T>(signal: Signal<T>): T {
	let node: Node | undefined = undefined;
	if (evalContext !== undefined) {
		node = signal._node;
		if (node === undefined || node._target !== evalContext) {
			// `signal` is a new dependency. Create a new node dependency node, move it
			//  to the front of the current context's dependency list.
			node = {
				_flags: 0,
				_version: 0,
				_source: signal,
				_nextSource: evalContext._sources,
				_target: evalContext,
				_rollbackNode: node,
			};
			evalContext._sources = node;
			signal._node = node;

			// Subscribe to change notifications from this dependency if we're in an effect
			// OR evaluating a computed signal that in turn has subscribers.
			if (evalContext._flags & SHOULD_SUBSCRIBE) {
				signal._subscribe(node);
			}
		} else if (node._flags & STALE) {
			// `signal` is an existing dependency from a previous evaluation. Reuse the dependency
			// node and move it to the front of the evaluation context's dependency list.
			node._flags &= ~STALE;

			const head = evalContext._sources;
			if (node !== head) {
				const prev = node._prevSource;
				const next = node._nextSource;
				if (prev !== undefined) {
					prev._nextSource = next;
				}
				if (next !== undefined) {
					next._prevSource = prev;
				}
				if (head !== undefined) {
					head._prevSource = node;
				}
				node._prevSource = undefined;
				node._nextSource = head;
				evalContext._sources = node;
			}

			// We can assume that the currently evaluated effect / computed signal is already
			// subscribed to change notifications from `signal` if needed.
		} else {
			// `signal` is an existing dependency from current evaluation.
			node = undefined;
		}
	}
	try {
		return signal.peek();
	} finally {
		if (node !== undefined) {
			node._version = signal._version;
		}
	}
}

declare class Signal<T = any> {
	/** @internal */
	_value: unknown;

	/** @internal */
	_version: number;

	/** @internal */
	_node?: Node;

	/** @internal */
	_targets?: Node;

	constructor(value?: T);

	/** @internal */
	_subscribe(node: Node): void;

	/** @internal */
	_unsubscribe(node: Node): void;

	subscribe(fn: (value: T) => void): () => void;

	valueOf(): T;

	toString(): string;

	peek(): T;

	value: T;
}

function Signal(this: Signal, value?: unknown) {
	this._value = value;
	this._version = 0;
	this._node = undefined;
	this._targets = undefined;
}

Signal.prototype._subscribe = function (node) {
	if (!(node._flags & SUBSCRIBED)) {
		node._flags |= SUBSCRIBED;
		node._nextTarget = this._targets;

		if (this._targets !== undefined) {
			this._targets._prevTarget = node;
		}
		this._targets = node;
	}
};

Signal.prototype._unsubscribe = function (node) {
	if (node._flags & SUBSCRIBED) {
		node._flags &= ~SUBSCRIBED;

		const prev = node._prevTarget;
		const next = node._nextTarget;
		if (prev !== undefined) {
			prev._nextTarget = next;
			node._prevTarget = undefined;
		}
		if (next !== undefined) {
			next._prevTarget = prev;
			node._nextTarget = undefined;
		}
		if (node === this._targets) {
			this._targets = next;
		}
	}
};

Signal.prototype.subscribe = function (fn) {
	return effect(() => fn(this.value));
};

Signal.prototype.valueOf = function () {
	return this.value;
};

Signal.prototype.toString = function () {
	return "" + this.value;
};

Signal.prototype.peek = function () {
	return this._value;
};

Object.defineProperty(Signal.prototype, "value", {
	get() {
		return getValue(this);
	},
	set(value: unknown) {
		if (value !== this._value) {
			if (batchIteration > 100) {
				cycleDetected();
			}

			this._value = value;
			this._version++;
			globalVersion++;

			/**@__INLINE__*/ startBatch();
			try {
				for (
					let node = this._targets;
					node !== undefined;
					node = node._nextTarget
				) {
					node._target._notify();
				}
			} finally {
				endBatch();
			}
		}
	},
});

function signal<T>(value: T): Signal<T> {
	return new Signal(value);
}

function prepareSources(target: Computed | Effect) {
	for (
		let node = target._sources;
		node !== undefined;
		node = node._nextSource
	) {
		const rollbackNode = node._source._node;
		if (rollbackNode !== undefined) {
			node._rollbackNode = rollbackNode;
		}
		node._source._node = node;
		node._flags |= STALE;
	}
}

function cleanupSources(target: Computed | Effect) {
	// At this point target._sources is a mishmash of current & former dependencies.
	// The current dependencies are also in a reverse order of use.
	// Therefore build a new, reverted list of dependencies containing only the current
	// dependencies in a proper order of use.
	// Drop former dependencies from the list and unsubscribe from their change notifications.

	let node = target._sources;
	let sources = undefined;
	while (node !== undefined) {
		const next = node._nextSource;
		if (node._flags & STALE) {
			node._source._unsubscribe(node);
			node._nextSource = undefined;
		} else {
			if (sources !== undefined) {
				sources._prevSource = node;
			}
			node._prevSource = undefined;
			node._nextSource = sources;
			sources = node;
		}

		node._source._node = node._rollbackNode;
		if (node._rollbackNode !== undefined) {
			node._rollbackNode = undefined;
		}
		node = next;
	}
	target._sources = sources;
}

function returnComputed<T>(computed: Computed<T>): T {
	computed._flags &= ~RUNNING;
	if (computed._flags & HAS_ERROR) {
		throw computed._value;
	}
	return computed._value as T;
}

function disposeNestedEffects(context: Computed | Effect) {
	let effect = context._effects;
	if (effect !== undefined) {
		do {
			effect._dispose();
			effect = effect._nextNestedEffect;
		} while (effect !== undefined);
		context._effects = undefined;
	}
}

declare class Computed<T = any> extends Signal<T> {
	/** @internal */
	_compute: () => T;

	/** @internal */
	_sources?: Node;

	/** @internal */
	_effects?: Effect;

	/** @internal */
	_globalVersion: number;

	/** @internal */
	_flags: number;

	constructor(compute: () => T);

	/** @internal */
	_subscribe(node: Node): void;

	/** @internal */
	_unsubscribe(node: Node): void;

	/** @internal */
	_notify(): void;

	peek(): T;

	readonly value: T;
}

/** @internal */
function Computed(this: Computed, compute: () => unknown) {
	Signal.call(this, undefined);

	this._compute = compute;
	this._sources = undefined;
	this._effects = undefined;
	this._globalVersion = globalVersion - 1;
	this._flags = STALE;
}

/** @internal */
Computed.prototype = Object.create(Signal.prototype);

Computed.prototype._subscribe = function (node) {
	if (this._targets === undefined) {
		this._flags |= STALE | SHOULD_SUBSCRIBE;

		// A computed signal subscribes lazily to its dependencies when the it
		// gets its first subscriber.
		for (
			let node = this._sources;
			node !== undefined;
			node = node._nextSource
		) {
			node._source._subscribe(node);
		}
	}
	Signal.prototype._subscribe.call(this, node);
};

Computed.prototype._unsubscribe = function (node) {
	Signal.prototype._unsubscribe.call(this, node);

	// Computed signal unsubscribes from its dependencies from it loses its last subscriber.
	if (this._targets === undefined) {
		this._flags &= ~SHOULD_SUBSCRIBE;

		for (
			let node = this._sources;
			node !== undefined;
			node = node._nextSource
		) {
			node._source._unsubscribe(node);
		}
	}
};

Computed.prototype._notify = function () {
	if (!(this._flags & NOTIFIED)) {
		this._flags |= STALE | NOTIFIED;

		for (
			let node = this._targets;
			node !== undefined;
			node = node._nextTarget
		) {
			node._target._notify();
		}
	}
};

Computed.prototype.peek = function () {
	this._flags &= ~NOTIFIED;

	if (this._flags & RUNNING) {
		cycleDetected();
	}
	this._flags |= RUNNING;

	if (!(this._flags & STALE) && this._targets !== undefined) {
		return returnComputed(this);
	}
	this._flags &= ~STALE;

	if (this._globalVersion === globalVersion) {
		return returnComputed(this);
	}
	this._globalVersion = globalVersion;

	if (this._version > 0) {
		// Check current dependencies for changes. The dependency list is already in
		// order of use. Therefore if >1 dependencies have changed only the first used one
		// is re-evaluated at this point.
		let node = this._sources;
		while (node !== undefined) {
			if (node._source._version !== node._version) {
				break;
			}
			try {
				node._source.peek();
			} catch {
				// Failures of current dependencies shouldn't be rethrown here in case the
				// compute function catches them.
			}
			if (node._source._version !== node._version) {
				break;
			}
			node = node._nextSource;
		}
		if (node === undefined) {
			return returnComputed(this);
		}
	}

	disposeNestedEffects(this);

	const prevValue = this._value;
	const prevFlags = this._flags;
	const prevContext = evalContext;
	try {
		evalContext = this;
		prepareSources(this);
		this._value = this._compute();
		this._flags &= ~HAS_ERROR;
		if (
			prevFlags & HAS_ERROR ||
			this._value !== prevValue ||
			this._version === 0
		) {
			this._version++;
		}
	} catch (err) {
		this._value = err;
		this._flags |= HAS_ERROR;
		this._version++;
	} finally {
		cleanupSources(this);
		evalContext = prevContext;
	}
	return returnComputed(this);
};

Object.defineProperty(Computed.prototype, "value", {
	get() {
		if (this._flags & RUNNING) {
			cycleDetected();
		}
		return getValue(this);
	},
});

function computed<T>(compute: () => T): Computed<T> {
	return new Computed(compute);
}

function endEffect(this: Effect, prevContext?: Computed | Effect) {
	if (evalContext !== this) {
		throw new Error("Out-of-order effect");
	}

	cleanupSources(this);

	evalContext = prevContext;
	endBatch();

	this._flags &= ~RUNNING;
}

declare class Effect {
	_compute: () => void;
	_sources?: Node;
	_effects?: Effect;
	_nextNestedEffect?: Effect;
	_nextBatchedEffect?: Effect;
	_flags: number;

	constructor(compute: () => void);

	_callback(): void;
	_start(): () => void;
	_notify(): void;
	_dispose(): void;
}

function Effect(this: Effect, compute: () => void) {
	this._compute = compute;
	this._sources = undefined;
	this._effects = undefined;
	this._nextNestedEffect = undefined;
	this._nextBatchedEffect = undefined;
	this._flags = SHOULD_SUBSCRIBE;
}

Effect.prototype._callback = function () {
	const finish = this._start();
	try {
		this._compute();
	} finally {
		finish();
	}
};

Effect.prototype._start = function () {
	if (this._flags & RUNNING) {
		cycleDetected();
	}
	this._flags |= RUNNING;
	this._flags &= ~DISPOSED;
	disposeNestedEffects(this);

	/*@__INLINE__**/ startBatch();
	const prevContext = evalContext;
	if (prevContext !== undefined) {
		this._nextNestedEffect = prevContext._effects;
		prevContext._effects = this;
	}
	evalContext = this;

	prepareSources(this);
	return endEffect.bind(this, prevContext);
};

Effect.prototype._notify = function () {
	if (!(this._flags & NOTIFIED)) {
		this._flags |= NOTIFIED;
		this._nextBatchedEffect = batchedEffect;
		batchedEffect = this;
	}
};

Effect.prototype._dispose = function () {
	if (this._flags & RUNNING) {
		throw new Error("Effect still running");
	}
	for (let node = this._sources; node !== undefined; node = node._nextSource) {
		node._source._unsubscribe(node);
	}
	disposeNestedEffects(this);
	this._sources = undefined;
	this._flags |= DISPOSED;
};

function effect(compute: () => void): () => void {
	const effect = new Effect(compute);
	effect._callback();
	// Return a bound function instead of a wrapper like `() => effect._dispose()`,
	// because bound functions seem to be just as fast and take up a lot less memory.
	return effect._dispose.bind(effect);
}

// Work around problems with the test runner not finding the exported Signal class object.
const _Signal = Signal;
export {
	signal,
	computed,
	effect,
	batch,
	_Signal as Signal,
	type Computed as ReadonlySignal
};
