import { Component } from "preact";
import { ReadonlySignal, Signal } from "@preact/signals-core";

export interface Effect {
	_sources: object | undefined;
	/** The effect's user-defined callback */
	_compute(): void;
	/** Begins an effectful read (returns the end() function) */
	_start(): () => void;
	/** Runs the effect */
	_callback(): void;
	_dispose(): void;
}

export interface Computed<T = any> extends ReadonlySignal<T> {
	_compute: () => T;
}

export interface PropertyUpdater {
	_update: (newSignal: Signal, newProps: Record<string, any>) => void;
	_dispose: () => void;
}

export interface AugmentedElement extends HTMLElement {
	_updaters?: Record<string, PropertyUpdater | undefined> | null;
}

export interface AugmentedComponent extends Component<any, any> {
	/** Component's most recent owner VNode */
	__v: VNode;
	/** _renderCallbacks */
	__h: (() => void)[];
	/** "mini-hooks" slots for useSignal/useComputed/useEffect */
	_slots?: (Signal | Computed | Effect)[];
	_updater?: Effect;
	_updateFlags: number;
}

export interface VNode<P = any> extends preact.VNode<P> {
	/** The component instance for this VNode */
	__c: AugmentedComponent;
	/** The parent VNode */
	__?: VNode;
	/** The DOM node for this VNode */
	__e?: Element | Text;
	/** Props that had Signal values before diffing (used after diffing to subscribe) */
	__np?: Record<string, any> | null;
}

export const enum OptionsTypes {
	HOOK = "__h",
	DIFF = "__b",
	DIFFED = "diffed",
	RENDER = "__r",
	CATCH_ERROR = "__e",
	UNMOUNT = "unmount",
}

export interface OptionsType {
	[OptionsTypes.HOOK](
		component: AugmentedComponent,
		index: number,
		type: number
	): void;
	[OptionsTypes.DIFF](vnode: VNode): void;
	[OptionsTypes.DIFFED](vnode: VNode): void;
	[OptionsTypes.RENDER](vnode: VNode): void;
	[OptionsTypes.CATCH_ERROR](error: any, vnode: VNode, oldVNode: VNode): void;
	[OptionsTypes.UNMOUNT](vnode: VNode): void;
}

export type HookFn<T extends keyof OptionsType> = (
	old: OptionsType[T],
	...a: Parameters<OptionsType[T]>
) => ReturnType<OptionsType[T]>;
