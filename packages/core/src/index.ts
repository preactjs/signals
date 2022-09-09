export interface ReadonlySignal<T> {
    peek(): T;
    readonly value: T;
}

export type Disposer = () => void;

type Listener = () => void;


// The current computed that is running
let currentComputed: Computed<unknown> | null = null;

// A set of listeners which will be triggered after the batch is complete
let batchPending: Set<Listener> | null = null;

const processingSignals: Set<Signal<unknown>> = new Set();


export function batch<T>(f: () => T): T {
    if (batchPending === null) {
        const listeners: Set<Listener> = new Set();

        const old = batchPending;
        batchPending = listeners;

        try {
            return f();

        } finally {
            batchPending = old;
            processingSignals.clear();

            // Trigger any pending listeners
            listeners.forEach((listener) => {
                listener();
            });
        }

    // We're already inside of an outer batch
    } else {
        return f();
    }
}


export class Signal<T> {
    // These property names get minified - see /mangle.json

    /** @internal */
    protected _value: T;

    constructor(value: T) {
        this._value = value;
    }

    public toString() {
        return "" + this.value;
    }

    /**
     * This uses WeakRef in order to avoid memory leaks: if the child is not
     * used anywhere then it can be garbage collected.
     *
     * @internal
     */
    protected _children: Set<WeakRef<Signal<unknown>>> = new Set();

    /**
     * Recurse down all children, marking them as dirty and adding
     * listeners to batchPending.
     *
     * @internal
     */
    protected _wakeup() {
        this._children.forEach((childRef) => {
            const child = childRef.deref();

            if (child) {
                child._wakeup();

            // If the child has been garbage collected, then remove it from the Set
            } else {
                this._children.delete(childRef);
            }
        });
    }

    public peek(): T {
        return this._value;
    }

    public get value(): T {
    	const value = this._value;

        if (currentComputed !== null) {
        	// This is used to detect infinite cycles
        	if (batchPending !== null) {
            	processingSignals.add(this);
            }

            // If accessing inside of a computed, add this to the computed's parents
            currentComputed._addDependency(this, value);
        }

        return value;
    }

    public set value(value: T) {
        if (currentComputed !== null && batchPending !== null && processingSignals.has(this)) {
            throw new Error("Cycle detected");
        }

        this._value = value;

        // If the value is set outside of a batch, this ensures that all of the
        // children will be fully marked as dirty before triggering any listeners
        batch(() => {
            this._wakeup();
        });
    }
}

export function signal<T>(value: T): Signal<T> {
    return new Signal(value);
}


class Computed<T> extends Signal<T> implements ReadonlySignal<T> {
    // These property names get minified - see /mangle.json

    /**
     * Whether this is the first time processing this computed
     *
     * @internal
     */
    protected _first: boolean = true;

    /**
     * Whether any of the computed's parents have changed or not.
     *
     * @internal
     */
    protected _dirty: boolean = true;

    /**
     * Whether the callback errored or not.
     *
     * @internal
     */
    protected _hasError: boolean = false;

    /**
     * WeakRefs have their own object identity, so we must reuse
     * the same WeakRef over and over again
     *
     * @internal
     */
    protected _weak: WeakRef<this> = new WeakRef(this);

    /**
     * The parent dependencies for this computed.
     *
     * @internal
     */
    protected _parents: Map<Signal<unknown>, unknown> = new Map();

    /** @internal */
    protected _callback: () => T;

    constructor(callback: () => T) {
        super(undefined as unknown as T);
        this._callback = callback;
    }

    /**
     * Mark this computed as dirty whenever any of its parents change.
     *
     * @internal
     */
    protected _wakeup() {
        this._dirty = true;
        super._wakeup();
    }

    /**
     * This is called when another Signal's .value is accessed inside of
     * this computed, it adds the Signal as a dependency of this computed.
     *
     * @internal
     */
    public _addDependency(parent: Signal<unknown>, value: unknown) {
        this._parents.set(parent, value);

        // This uses a WeakRef to avoid a memory leak
        (parent as any)._children.add(this._weak);
    }

    /**
     * Removes all links between this computed and its dependencies.
     *
     * @internal
     */
    protected _removeDependencies() {
        this._parents.forEach((_value, parent) => {
            (parent as any)._children.delete(this._weak);
        });

        this._parents.clear();
    }

    public peek(): T {
        if (this._dirty) {
            this._dirty = false;

            try {
                let changed = false;

                if (this._first) {
                	this._first = false;
                    changed = true;

                } else {
                    // This checks if at least one of its parents has a different value
                    this._parents.forEach((oldValue, parent) => {
                        const newValue = parent.peek();

                        if (oldValue !== newValue) {
                            changed = true;
                        }
                    });
                }

                if (changed) {
                    this._hasError = false;

                    // Because the dependencies might have changed, we first
                    // remove all of the old links between this computed and
                    // its dependencies.
                    //
                    // The links will be recreated by the _addDependency method.
                    this._removeDependencies();

                    const old = currentComputed;
                    currentComputed = this;

                    try {
                        this._value = this._callback();

                    } finally {
                        currentComputed = old;
                    }
                }

            } catch (e) {
                this._hasError = true;

                // We reuse the _value slot for the error, instead of using a separate property
                this._value = e as T;
            }
        }

        if (this._hasError) {
            throw this._value;

        } else {
            return this._value;
        }
    }

    public get value(): T {
        const value = this.peek();

        if (currentComputed !== null) {
        	// If accessing inside of a computed, add this to the computed's parents
            currentComputed._addDependency(this, value);
        }

        return value;
    }

    public set value(v: T) {
        throw new Error("Computed signals are readonly");
    }
}

export function computed<T>(f: () => T): ReadonlySignal<T> {
    return new Computed(f);
}


class Effect<T> extends Computed<T> implements ReadonlySignal<T> {
    // These property names get minified - see /mangle.json

    /** @internal */
    protected _listener: Listener | null = null;

    constructor(callback: () => T) {
        super(callback);
    }

    /** @internal */
    protected _wakeup() {
        if (batchPending === null) {
            throw new Error("Invalid batchPending");
        }

        if (this._listener !== null) {
            batchPending!.add(this._listener);
        }

        super._wakeup();
    }

    /** @internal */
    public _listen(callback: (value: T) => void): Disposer {
        let oldValue = this.value;

        const listener = () => {
            const newValue = this.value;

            if (oldValue !== newValue) {
                oldValue = newValue;
                callback(oldValue);
            }
        };

        this._listener = listener;

        callback(oldValue);

        return () => {
            this._listener = null;
            this._removeDependencies();
        };
    }
}

export function effect(callback: () => void): Disposer {
    return new Effect(() => batch(callback))._listen(() => {});
}
