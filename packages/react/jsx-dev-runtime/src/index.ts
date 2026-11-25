import { Signal } from "@preact/signals-core";
import { useSignals } from "@preact/signals-react/runtime";
import { forwardRef } from "react";
import type * as React from "react";
import * as reactJsxDevRuntime from "react/jsx-dev-runtime";
import type {
	JSX,
	SignalLike,
	Signalish,
	SignalishProps,
} from "@preact/signals-react/jsx-runtime";

export type { JSX, SignalLike, Signalish, SignalishProps };

const reactJsxDEV = (reactJsxDevRuntime as any).jsxDEV;

export const Fragment: typeof React.Fragment = (reactJsxDevRuntime as any)
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
		type,
		props,
		isStaticChildren,
		source,
		self,
	}: {
		type: string;
		props: Record<string, any>;
		isStaticChildren?: boolean;
		source?: unknown;
		self?: unknown;
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
		return reactJsxDEV(
			type,
			nextProps,
			undefined,
			isStaticChildren,
			source,
			self
		);
	} finally {
		store?.f();
	}
});

SignalElement.displayName = "SignalElement";

export function jsxDEV(
	type: any,
	props: any,
	key?: React.Key,
	isStaticChildren?: boolean,
	source?: unknown,
	self?: unknown
): JSX.Element {
	if (typeof type === "string" && hasSignalProp(props)) {
		const elementProps: Record<string, any> = {
			type,
			props,
			isStaticChildren,
			source,
			self,
		};
		if (props.ref !== undefined) {
			elementProps.ref = props.ref;
		}
		return reactJsxDEV(SignalElement, elementProps, key, false, source, self);
	}
	return reactJsxDEV(type, props, key, isStaticChildren, source, self);
}
