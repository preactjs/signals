import { Component } from "preact";
import { Signal } from "@preact/signals-core";

export interface VNode<P = any> extends preact.VNode<P> {
	/** The component instance for this VNode */
	__c: Component;
	/** The parent VNode */
	__?: VNode;
	/** The DOM node for this VNode */
	__e?: Element | Text;
	/** Props that had Signal values before diffing (used after diffing to subscribe) */
	__np?: Record<string, any> | null;
}

export interface ComponentType extends Component {
	/** This component's owner VNode */
	__v: VNode;
}

export type Updater = Signal<unknown>;

export interface ElementUpdater extends Updater {
	_props: Record<string, any>;
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
	[OptionsTypes.HOOK](component: Component, index: number, type: number): void;
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
