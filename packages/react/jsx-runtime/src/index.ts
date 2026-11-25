import { Signal } from "@preact/signals-core";
import { useSignals } from "@preact/signals-react/runtime";
import { forwardRef } from "react";
import type * as React from "react";
import * as reactJsxRuntime from "react/jsx-runtime";

declare module "@preact/signals-core" {
	// @ts-ignore internal Signal is viewed as function
	interface Signal extends React.ReactElement {}
	// @ts-ignore internal Signal is viewed as function
	interface ReadonlySignal extends React.ReactElement {}
}

export interface SignalLike<T> {
	readonly value: T;
	peek(): T;
	subscribe(fn: (value: T) => void): () => void;
}

export type Signalish<T> = T | SignalLike<T>;

export type SignalishProps<P> = {
	[K in keyof P]: K extends
		| "dangerouslySetInnerHTML"
		| "key"
		| "ref"
		| `on${Capitalize<string>}`
		? P[K]
		: Signalish<P[K]>;
};

type IntrinsicElementKeys = Extract<React.ElementType, string>;

type InexactPartial<T> = { [K in keyof T]?: T[K] | undefined };

type Defaultize<P, D> = P extends any
	? string extends keyof P
		? P
		: Pick<P, Exclude<keyof P, keyof D>> &
				InexactPartial<Pick<P, Extract<keyof P, keyof D>>> &
				InexactPartial<Pick<D, Exclude<keyof D, keyof P>>>
	: never;

type ReactManagedAttributes<C, P> = C extends { defaultProps: infer D }
	? Defaultize<P, D>
	: P;

export namespace JSX {
	export type ElementType = string | React.JSXElementConstructor<any>;
	export type Element = React.ReactElement<any, any>;
	export type ElementClass = React.Component<any>;
	export type ElementAttributesProperty = { props: {} };
	export type ElementChildrenAttribute = { children: {} };
	export type LibraryManagedAttributes<C, P> = C extends
		| React.MemoExoticComponent<infer T>
		| React.LazyExoticComponent<infer T>
		? T extends
				| React.MemoExoticComponent<infer U>
				| React.LazyExoticComponent<infer U>
			? ReactManagedAttributes<U, P>
			: ReactManagedAttributes<T, P>
		: ReactManagedAttributes<C, P>;
	export type IntrinsicAttributes = React.Attributes;
	export type IntrinsicClassAttributes<T> = React.ClassAttributes<T>;
	export type IntrinsicElements = {
		[K in IntrinsicElementKeys]: SignalishProps<React.ComponentProps<K>>;
	};
}

const reactJsx = (reactJsxRuntime as any).jsx;
const reactJsxs = (reactJsxRuntime as any).jsxs;

export const Fragment: typeof React.Fragment = (reactJsxRuntime as any)
	.Fragment;

function hasSignalProp(props: Record<string, any> | null | undefined): boolean {
	if (!props) return false;
	for (const key in props) {
		if (
			key !== "children" &&
			key !== "ref" &&
			key !== "key" &&
			props[key] instanceof Signal
		) {
			return true;
		}
	}
	return false;
}

const SignalElement = forwardRef(function SignalElement(
	{
		jsx: jsxFn,
		type,
		props,
	}: {
		jsx: (type: any, props: any) => JSX.Element;
		type: string;
		props: Record<string, any>;
	},
	ref: any
) {
	const store = useSignals(1, type);
	try {
		const nextProps: Record<string, any> = {};
		for (const key in props) {
			if (key === "ref") continue;
			const value = props[key];
			nextProps[key] =
				key !== "children" && key !== "key" && value instanceof Signal
					? value.value
					: value;
		}
		if (ref != null) {
			nextProps.ref = ref;
		}
		return jsxFn(type, nextProps);
	} finally {
		store?.f();
	}
});

SignalElement.displayName = "SignalElement";

function createJsx(jsxFn: any) {
	return function (type: any, props: any, key?: React.Key): JSX.Element {
		if (typeof type === "string" && hasSignalProp(props)) {
			const elementProps: Record<string, any> = {
				jsx: jsxFn,
				type,
				props,
			};
			if (props.ref !== undefined) {
				elementProps.ref = props.ref;
			}
			return key !== undefined
				? reactJsx(SignalElement, elementProps, key)
				: reactJsx(SignalElement, elementProps);
		}
		return key !== undefined ? jsxFn(type, props, key) : jsxFn(type, props);
	};
}

export const jsx: (type: any, props: any, key?: React.Key) => JSX.Element =
	createJsx(reactJsx);
export const jsxs: (type: any, props: any, key?: React.Key) => JSX.Element =
	createJsx(reactJsxs);
