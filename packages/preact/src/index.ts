import { options, Component, isValidElement, Fragment } from "preact";
import { useRef, useMemo, useEffect, useState } from "preact/hooks";
import {
	signal,
	computed,
	batch,
	effect,
	Signal,
	type ReadonlySignal,
	untracked,
	SignalOptions,
	EffectOptions,
} from "@preact/signals-core";
import {
	VNode,
	OptionsTypes,
	HookFn,
	Effect,
	PropertyUpdater,
	AugmentedComponent,
	AugmentedElement as Element,
} from "./internal";

export {
	signal,
	computed,
	batch,
	effect,
	Signal,
	type ReadonlySignal,
	untracked,
};

const DEVTOOLS_ENABLED =
	typeof window !== "undefined" && !!window.__PREACT_SIGNALS_DEVTOOLS__;

const HAS_PENDING_UPDATE = 1 << 0;
const HAS_HOOK_STATE = 1 << 1;
const HAS_COMPUTEDS = 1 << 2;

let oldNotify: (this: Effect) => void,
	effectsQueue: Array<Effect> = [],
	domQueue: Array<Effect> = [];

// Capture the original `Effect.prototype._notify` method so that we can install
// custom `._notify`s for each different use-case but still call the original
// implementation in the end. Dispose the temporary effect immediately afterwards.
effect(function (this: Effect) {
	oldNotify = this._notify;
})();

// Install a Preact options hook
function hook<T extends OptionsTypes>(hookName: T, hookFn: HookFn<T>) {
	// @ts-ignore-next-line private options hooks usage
	options[hookName] = hookFn.bind(null, options[hookName] || (() => {}));
}

let currentComponent: AugmentedComponent | undefined;
let finishUpdate: (() => void) | undefined;

function setCurrentUpdater(updater?: Effect) {
	// end tracking for the current update:
	if (finishUpdate) finishUpdate();
	// start tracking the new update:
	finishUpdate = updater && updater._start();
}

function createUpdater(update: () => void) {
	let updater!: Effect;
	effect(function (this: Effect) {
		updater = this;
	});
	updater._callback = update;
	return updater;
}

/** @todo This may be needed for complex prop value detection. */
// function isSignalValue(value: any): value is Signal {
// 	if (typeof value !== "object" || value == null) return false;
// 	if (value instanceof Signal) return true;
// 	// @TODO: uncomment this when we land Reactive (ideally behind a brand check)
// 	// for (let i in value) if (value[i] instanceof Signal) return true;
// 	return false;
// }

/**
 * A wrapper component that renders a Signal directly as a Text node.
 * @todo: in Preact 11, just decorate Signal with `type:null`
 */
function SignalValue(this: AugmentedComponent, { data }: { data: Signal }) {
	// hasComputeds.add(this);

	// Store the props.data signal in another signal so that
	// passing a new signal reference re-runs the text computed:
	const currentSignal = useSignal(data);
	currentSignal.value = data;

	const [isText, s] = useMemo(() => {
		let self = this;
		// mark the parent component as having computeds so it gets optimized
		let v = this.__v;
		while ((v = v.__!)) {
			if (v.__c) {
				v.__c._updateFlags |= HAS_COMPUTEDS;
				break;
			}
		}

		const wrappedSignal = computed(() => {
			let s = currentSignal.value.value;
			return s === 0 ? 0 : s === true ? "" : s || "";
		});

		const isText = computed(
			() =>
				!Array.isArray(wrappedSignal.value) &&
				!isValidElement(wrappedSignal.value)
		);
		// Update text nodes directly without rerendering when the new value
		// is also text.
		const dispose = effect(function (this: Effect) {
			this._notify = notifyDomUpdates;

			// Subscribe to wrappedSignal updates only when its values are text...
			if (isText.value) {
				// ...but regardless of `self.base`'s current value, as it can be
				// undefined before mounting or a non-text node. In both of those cases
				// the update gets handled by a full rerender.
				const value = wrappedSignal.value;
				if (self.__v && self.__v.__e && self.__v.__e.nodeType === 3) {
					(self.__v.__e as Text).data = value;
				}
			}
		});

		// Piggyback this._updater's disposal to ensure that the text updater effect
		// above also gets disposed on unmount.
		const oldDispose = this._updater!._dispose;
		this._updater!._dispose = function () {
			dispose();
			oldDispose.call(this);
		};

		return [isText, wrappedSignal];
	}, []);

	// Rerender the component whenever `data.value` changes from a VNode
	// to another VNode, from text to a VNode, or from a VNode to text.
	// That is, everything else except text-to-text updates.
	//
	// This also ensures that the backing DOM node types gets updated to
	// text nodes and back when needed.
	//
	// For text-to-text updates, `.peek()` is used to skip full rerenders,
	// leaving them to the optimized path above.
	return isText.value ? s.peek() : s.value;
}

SignalValue.displayName = "ReactiveTextNode";

Object.defineProperties(Signal.prototype, {
	constructor: { configurable: true, value: undefined },
	type: { configurable: true, value: SignalValue },
	props: {
		configurable: true,
		get() {
			return { data: this };
		},
	},
	// Setting a VNode's _depth to 1 forces Preact to clone it before modifying:
	// https://github.com/preactjs/preact/blob/d7a433ee8463a7dc23a05111bb47de9ec729ad4d/src/diff/children.js#L77
	// @todo remove this for Preact 11
	__b: { configurable: true, value: 1 },
});

/** Inject low-level property/attribute bindings for Signals into Preact's diff */
hook(OptionsTypes.DIFF, (old, vnode) => {
	if (DEVTOOLS_ENABLED && typeof vnode.type === "function") {
		window.__PREACT_SIGNALS_DEVTOOLS__.exitComponent();
	}

	if (typeof vnode.type === "string") {
		let signalProps: Record<string, any> | undefined;

		let props = vnode.props;
		for (let i in props) {
			if (i === "children") continue;

			let value = props[i];
			if (value instanceof Signal) {
				if (!signalProps) vnode.__np = signalProps = {};
				signalProps[i] = value;
				props[i] = value.peek();
			}
		}
	}

	old(vnode);
});

/** Set up Updater before rendering a component */
hook(OptionsTypes.RENDER, (old, vnode) => {
	if (DEVTOOLS_ENABLED && typeof vnode.type === "function") {
		window.__PREACT_SIGNALS_DEVTOOLS__.enterComponent(vnode);
	}

	// Ignore the Fragment inserted by preact.createElement().
	if (vnode.type !== Fragment) {
		setCurrentUpdater();

		let updater;

		let component = vnode.__c;
		if (component) {
			component._updateFlags &= ~HAS_PENDING_UPDATE;

			updater = component._updater;
			if (updater === undefined) {
				component._updater = updater = createUpdater(() => {
					component._updateFlags |= HAS_PENDING_UPDATE;
					component.setState({});
				});
			}
		}

		currentComponent = component;
		setCurrentUpdater(updater);
	}

	old(vnode);
});

/** Finish current updater if a component errors */
hook(OptionsTypes.CATCH_ERROR, (old, error, vnode, oldVNode) => {
	if (DEVTOOLS_ENABLED) {
		window.__PREACT_SIGNALS_DEVTOOLS__.exitComponent();
	}

	setCurrentUpdater();
	currentComponent = undefined;
	old(error, vnode, oldVNode);
});

/** Finish current updater after rendering any VNode */
hook(OptionsTypes.DIFFED, (old, vnode) => {
	if (DEVTOOLS_ENABLED && typeof vnode.type === "function") {
		window.__PREACT_SIGNALS_DEVTOOLS__.exitComponent();
	}

	setCurrentUpdater();
	currentComponent = undefined;

	let dom: Element;

	// vnode._dom is undefined during string rendering,
	// so we use this to skip prop subscriptions during SSR.
	if (typeof vnode.type === "string" && (dom = vnode.__e as Element)) {
		let props = vnode.__np;
		let renderedProps = vnode.props;
		if (props) {
			let updaters = dom._updaters;
			if (updaters) {
				for (let prop in updaters) {
					let updater = updaters[prop];
					if (updater !== undefined && !(prop in props)) {
						updater._dispose();
						// @todo we could just always invoke _dispose() here
						updaters[prop] = undefined;
					}
				}
			} else {
				updaters = {};
				dom._updaters = updaters;
			}
			for (let prop in props) {
				let updater = updaters[prop];
				let signal = props[prop];
				if (updater === undefined) {
					updater = createPropUpdater(dom, prop, signal, renderedProps);
					updaters[prop] = updater;
				} else {
					updater._update(signal, renderedProps);
				}
			}
		}
	}
	old(vnode);
});

function createPropUpdater(
	dom: Element,
	prop: string,
	propSignal: Signal,
	props: Record<string, any>
): PropertyUpdater {
	const setAsProperty =
		prop in dom &&
		// SVG elements need to go through `setAttribute` because they
		// expect things like SVGAnimatedTransformList instead of strings.
		// @ts-ignore
		dom.ownerSVGElement === undefined;

	const changeSignal = signal(propSignal);
	return {
		_update: (newSignal: Signal, newProps: typeof props) => {
			changeSignal.value = newSignal;
			props = newProps;
		},
		_dispose: effect(function (this: Effect) {
			this._notify = notifyDomUpdates;
			const value = changeSignal.value.value;
			// If Preact just rendered this value, don't render it again:
			if (props[prop] === value) return;
			props[prop] = value;
			if (setAsProperty) {
				// @ts-ignore-next-line silly
				dom[prop] = value;
				// Match Preact's attribute handling: data-* and aria-* attributes
				// https://github.com/preactjs/preact/blob/main/src/diff/props.js#L132
			} else if (value != null && (value !== false || prop[4] === "-")) {
				dom.setAttribute(prop, value);
			} else {
				dom.removeAttribute(prop);
			}
		}),
	};
}

/** Unsubscribe from Signals when unmounting components/vnodes */
hook(OptionsTypes.UNMOUNT, (old, vnode: VNode) => {
	if (typeof vnode.type === "string") {
		let dom = vnode.__e as Element | undefined;
		// vnode._dom is undefined during string rendering
		if (dom) {
			const updaters = dom._updaters;
			if (updaters) {
				dom._updaters = undefined;
				for (let prop in updaters) {
					let updater = updaters[prop];
					if (updater) updater._dispose();
				}
			}
		}
	} else {
		let component = vnode.__c;
		if (component) {
			const updater = component._updater;
			if (updater) {
				component._updater = undefined;
				updater._dispose();
			}
		}
	}
	old(vnode);
});

/** Mark components that use hook state so we can skip sCU optimization. */
hook(OptionsTypes.HOOK, (old, component, index, type) => {
	if (type < 3 || type === 9)
		(component as AugmentedComponent)._updateFlags |= HAS_HOOK_STATE;
	old(component, index, type);
});

/**
 * Auto-memoize components that use Signals/Computeds.
 * Note: Does _not_ optimize components that use hook/class state.
 */
Component.prototype.shouldComponentUpdate = function (
	this: AugmentedComponent,
	props,
	state
) {
	// @todo: Once preactjs/preact#3671 lands, this could just use `currentUpdater`:
	const updater = this._updater;
	const hasSignals = updater && updater._sources !== undefined;

	// If this is a component using state, rerender
	// @ts-ignore
	for (let i in state) return true;

	if (this.__f || (typeof this.u == "boolean" && this.u === true)) {
		const hasHooksState = this._updateFlags & HAS_HOOK_STATE;
		// if this component used no signals or computeds and no hooks state, update:
		if (!hasSignals && !hasHooksState && !(this._updateFlags & HAS_COMPUTEDS))
			return true;

		// if there is a pending re-render triggered from Signals,
		// or if there is hooks state, update:
		if (this._updateFlags & HAS_PENDING_UPDATE) return true;
	} else {
		// if this component used no signals or computeds, update:
		if (!hasSignals && !(this._updateFlags & HAS_COMPUTEDS)) return true;

		// if there is a pending re-render triggered from Signals,
		// or if there is hooks state, update:
		if (this._updateFlags & (HAS_PENDING_UPDATE | HAS_HOOK_STATE)) return true;
	}

	// if any non-Signal props changed, update:
	for (let i in props) {
		if (i !== "__source" && props[i] !== this.props[i]) return true;
	}
	for (let i in this.props) if (!(i in props)) return true;

	// this is a purely Signal-driven component, don't update:
	return false;
};

export function useSignal<T>(value: T, options?: SignalOptions<T>): Signal<T>;
export function useSignal<T = undefined>(): Signal<T | undefined>;
export function useSignal<T>(value?: T, options?: SignalOptions<T>) {
	return useState(() =>
		signal<T | undefined>(value, options as SignalOptions)
	)[0];
}

export function useComputed<T>(compute: () => T, options?: SignalOptions<T>) {
	const $compute = useRef(compute);
	$compute.current = compute;
	(currentComponent as AugmentedComponent)._updateFlags |= HAS_COMPUTEDS;
	return useMemo(() => computed<T>(() => $compute.current(), options), []);
}

function safeRaf(callback: () => void) {
	const done = () => {
		clearTimeout(timeout);
		cancelAnimationFrame(raf);
		callback();
	};

	const timeout = setTimeout(done, 35);
	const raf = requestAnimationFrame(done);
}

const deferEffects =
	typeof requestAnimationFrame === "undefined" ? setTimeout : safeRaf;

const deferDomUpdates = (cb: any) => {
	queueMicrotask(() => {
		queueMicrotask(cb);
	});
};

function flushEffects() {
	batch(() => {
		let inst: Effect | undefined;
		while ((inst = effectsQueue.shift())) {
			oldNotify.call(inst);
		}
	});
}

function notifyEffects(this: Effect) {
	if (effectsQueue.push(this) === 1) {
		(options.requestAnimationFrame || deferEffects)(flushEffects);
	}
}

function flushDomUpdates() {
	batch(() => {
		let inst: Effect | undefined;
		while ((inst = domQueue.shift())) {
			oldNotify.call(inst);
		}
	});
}

function notifyDomUpdates(this: Effect) {
	if (domQueue.push(this) === 1) {
		(options.requestAnimationFrame || deferDomUpdates)(flushDomUpdates);
	}
}

export function useSignalEffect(
	cb: () => void | (() => void),
	options?: EffectOptions
) {
	const callback = useRef(cb);
	callback.current = cb;

	useEffect(() => {
		return effect(function (this: Effect) {
			this._notify = notifyEffects;
			return callback.current();
		}, options);
	}, []);
}

/**
 * @todo Determine which Reactive implementation we'll be using.
 * @internal
 */
// export function useReactive<T extends object>(value: T): Reactive<T> {
// 	return useMemo(() => reactive<T>(value), []);
// }

/**
 * @internal
 * Update a Reactive's using the properties of an object or other Reactive.
 * Also works for Signals.
 * @example
 *   // Update a Reactive with Object.assign()-like syntax:
 *   const r = reactive({ name: "Alice" });
 *   update(r, { name: "Bob" });
 *   update(r, { age: 42 }); // property 'age' does not exist in type '{ name?: string }'
 *   update(r, 2); // '2' has no properties in common with '{ name?: string }'
 *   console.log(r.name.value); // "Bob"
 *
 * @example
 *   // Update a Reactive with the properties of another Reactive:
 *   const A = reactive({ name: "Alice" });
 *   const B = reactive({ name: "Bob", age: 42 });
 *   update(A, B);
 *   console.log(`${A.name} is ${A.age}`); // "Bob is 42"
 *
 * @example
 *   // Update a signal with assign()-like syntax:
 *   const s = signal(42);
 *   update(s, "hi"); // Argument type 'string' not assignable to type 'number'
 *   update(s, {}); // Argument type '{}' not assignable to type 'number'
 *   update(s, 43);
 *   console.log(s.value); // 43
 *
 * @param obj The Reactive or Signal to be updated
 * @param update The value, Signal, object or Reactive to update `obj` to match
 * @param overwrite If `true`, any properties `obj` missing from `update` are set to `undefined`
 */
/*
export function update<T extends SignalOrReactive>(
	obj: T,
	update: Partial<Unwrap<T>>,
	overwrite = false
) {
	if (obj instanceof Signal) {
		obj.value = peekValue(update);
	} else {
		for (let i in update) {
			if (i in obj) {
				obj[i].value = peekValue(update[i]);
			} else {
				let sig = signal(peekValue(update[i]));
				sig[KEY] = i;
				obj[i] = sig;
			}
		}
		if (overwrite) {
			for (let i in obj) {
				if (!(i in update)) {
					obj[i].value = undefined;
				}
			}
		}
	}
}
*/
