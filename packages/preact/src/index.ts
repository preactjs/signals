import {
	Options,
	createElement,
	Component,
	options as preactOpts,
	VNode,
} from "preact";
import { useMemo, useRef } from "preact/hooks";
import {
	computed,
	GetSignalValue,
	peekValue,
	signal,
	Signal,
	currentSignal,
	setTrackingSignal,
} from "@preact/signals-core";

interface PreactVNode extends VNode {
	__c?: Component;
	__e: HTMLElement | Text;
}

interface PreactOptions extends Options {
	__h: (component: Component, index: number, type: number) => void;
	__b: (vnode: PreactVNode) => void;
	__r: (vnode: PreactVNode) => void;
}

// FIXME: We should get rid of this
const SUBS = Symbol.for("subs");

const options = preactOpts as PreactOptions;

let currentComponent: Component | undefined;
let currentComponentSignal: Signal | undefined;
const componentSignals = new WeakMap<Component | PreactVNode, Signal>();
const signalsForUpdater = new WeakMap<Updater, Set<Signal>>();
const unusedSignalsForUpdater = new WeakMap<Updater, Set<Signal>>();

function setCurrentSignal(signal: Signal) {
	currentComponentSignal = signal;

	// keep track of the previous signals accessed by this component.
	// When previously-accessed symbols are not accessed in a render, unsubscribe.
	let signals = signalsForUpdater.get(signal);
	if (!signals) {
		signalsForUpdater.set(signal, (signals = new Set()));
	}
	unusedSignalsForUpdater.set(signal, new Set(signals));
}

function finishCurrentUpdater(updater: Updater) {
	let signals = signalsForUpdater.get(updater)!;
	let unused = unusedSignalsForUpdater.get(updater)!;
	for (const signal of unused) {
		signal[SUBS].delete(updater);
		signals.delete(signal);
	}
	if (currentComponentSignal === updater) currentComponentSignal = undefined;
}

// Track various types of state usage to determine auto-memoization status
const hasHookState = new WeakSet<Component>();
const hasPendingUpdate = new WeakSet<Component>();
const hasComputeds = new WeakSet<Component>();

// Mark components that use hook state
// @ts-ignore
let oldHook = options.__h;
options.__h = (component, index, type) => {
	if (type < 3) hasHookState.add(component);
	if (oldHook) oldHook(component, index, type);
};

// Auto-memoize components that use Signals but not hook/class state
Component.prototype.shouldComponentUpdate = function (props, state) {
	// if this component doesn't have any Signals, don't optimize:
	const updater = componentSignals.get(this);
	const hasSignals = updater && signalsForUpdater.get(updater)?.size !== 0;
	// Note: this bailout is too broad.
	// Right now, fully text-optimized components are considered
	// as _not_ having Signals because the updates are bound to their DOM subtree's VNodes.
	if (!hasSignals && !hasComputeds.has(this)) return true;
	// if there is a pending re-render triggered from Signals, update:
	if (hasPendingUpdate.delete(this)) return true;
	// if there is hook or class state, update:
	if (hasHookState.has(this)) return true;
	for (let i in state) return true;
	// if any (non-signal) props changed, update:
	for (let i in props) {
		if (props[i] !== this.props[i] && i !== "__source") return true;
	}
	for (let i in this.props) if (!(i in props)) return true;
	return false;
};

// Eager removal of unmounted components/vnodes from mappings
function free(thing: VNode | Component) {
	const updater = componentSignals.get(thing);
	const signals = updater && signalsForUpdater.get(updater);
	if (signals) {
		for (const signal of signals) signal[SUBS].delete(updater);
		signalsForUpdater.delete(updater);
		componentSignals.delete(thing);
	}
}
const oldUnmount = options.unmount;
options.unmount = (vnode: PreactVNode) => {
	free(vnode);
	if (vnode.__c) free(vnode.__c);
	if (oldUnmount) oldUnmount(vnode);
};

function peekOrGetValue<T>(_: T): T extends Signal ? GetSignalValue<T> : T {
	return _ instanceof Signal ? peekValue(_) : _;
}

// Inject low-level property/attribute bindings for Signals into Preact's diff
const oldDiff = options.__b;
options.__b = vnode => {
	if (typeof vnode.type === "string") {
		// let orig = vnode.__o || vnode;
		let signal = componentSignals.get(vnode);
		if (!signal) {
			signal = new Signal(undefined);
			signal.updater = function treeUpdater() {
				let dom = vnode.__e as HTMLElement;
				for (let i in vnode.props) {
					if (i === "children") continue;
					let value = peekOrGetValue((vnode.props as any)[i]);
					if (i in dom) {
						(dom as any)[i] = value;
					} else if (value) {
						dom.setAttribute(i, value);
					} else {
						dom.removeAttribute(i);
					}
				}
			};
			// updater.target = vnode;
			setCurrentSignal(signal);
			componentSignals.set(vnode, signal);
		}
	}

	if (typeof vnode.type === "string") {
		let children = vnode.props.children;
		if (children) childToSignal(children, "children", vnode.props);
		// for (let i in vnode.props) {
		//   const value = vnode.props[i];
		//   if (value instanceof Signal) vnode.props[i] = value.value;
		// }
	}

	if (oldDiff) oldDiff(vnode);
};

let oldRender = options.__r;
options.__r = vnode => {
	let component = vnode.__c;
	currentComponent = component;
	let updater = componentSignals.get(component!);
	console.log("render", updater);
	if (updater === undefined) {
		// updater = component.setState.bind(component, {});
		updater = function componentUpdater() {
			hasPendingUpdate.add(component!);
			component!.setState({});
		};
		// updater.target = component;
		componentSignals.set(component!, updater);
	}

	// if (updater !== currentUpdater) isRendering++;
	setCurrentSignal(updater);
	if (oldRender) oldRender(vnode);
};

let oldDiffed = options.diffed;
options.diffed = (vnode: PreactVNode) => {
	let component = vnode.__c;
	if (component) {
		if (component === currentComponent) currentComponent = undefined;
		// isRendering--;
		finishCurrentUpdater(componentSignals.get(component)!);
	}
	if (oldDiffed) oldDiffed(vnode);
	// if (queue.size) flushValues();
};

// A wrapper component that renders a Signal as Text
// Todo: in Preact 11, just decorate Signal with `type:null`.
function Text(this: any, { data }: { data: Signal }) {
	// mark the parent component as having computeds so it gets optimized
	let v = this.__v;
	while ((v = v.__)) {
		if (v.__c) {
			hasComputeds.add(v.__c);
			break;
		}
	}
	return data.value + "";
}

function childToSignal<T, R = T extends Signal ? Record<string, unknown> : T[]>(
	child: T,
	i: number | string,
	arr: R
) {
	if (Array.isArray(child)) child.forEach(childToSignal);
	else if (child instanceof Signal) {
		(arr as any)[i] = createElement(Text as any, { data: child });
	}
}

export function useSignal<T>(value: T) {
	return useMemo(() => signal<T>(value), []);
}

export function useComputed<T>(compute: () => T) {
	const $compute = useRef(compute);
	$compute.current = compute;
	hasComputeds.add(currentComponent!);
	return useMemo(() => computed<T>(() => $compute.current()), []);
}
