import {
	computed,
	signal,
	type ReadonlySignal,
	type Signal,
} from "@preact/signals-core";
import { useSignalRef } from "@preact/signals-react/utils";
import * as React from "react";

declare global {
	namespace JSX {
		interface IntrinsicElements {
			"custom-signal-el": {
				"shop-id"?: string;
				"total-due"?: string | ReadonlySignal<string>;
			};
		}
	}
}

const height: ReadonlySignal<number> = computed(() => 370);
const mutableHeight: Signal<number> = signal(370);
const optionalHeight: ReadonlySignal<number | undefined> = computed(
	() => undefined
);
const className: ReadonlySignal<string> = computed(() => "badge");
const styleSig = computed<React.CSSProperties>(() => ({ opacity: 1 }));
const labelSig = signal("Close");
const hiddenSig = signal(true);
const testIdSig = signal("foo");
const transformSig = signal("rotate(45)");
const valueSig = signal("abc");
const disabledSig = signal(false);

export function ValidIntrinsicSignalProps() {
	const iframeRef = React.createRef<HTMLIFrameElement>();
	const sigRef = useSignalRef<HTMLDivElement | null>(null);

	return (
		<div
			ref={sigRef}
			className={className}
			style={styleSig}
			aria-label={labelSig}
			aria-hidden={hiddenSig}
			data-testid={testIdSig}
		>
			<iframe
				ref={iframeRef}
				title="Shop Pay"
				src="https://shop.app"
				height={height}
				width={mutableHeight}
				onLoad={e => {
					const el: HTMLIFrameElement = e.currentTarget;
					void el;
				}}
			/>
			<iframe height={optionalHeight} />
			<input
				value={valueSig}
				disabled={disabledSig}
				onChange={e => {
					const v: string = e.currentTarget.value;
					void v;
				}}
			/>
			<svg>
				<line transform={transformSig} x1={height} />
			</svg>
			<custom-signal-el shop-id={labelSig} total-due={labelSig} />
			<>
				<span>{height}</span>
				<span>Value: {height}</span>
			</>
		</div>
	);
}

class WithDefaults extends React.Component<{ a: string; b: number }> {
	static defaultProps = { b: 42 };
	render() {
		return <div>{this.props.a}</div>;
	}
}

const MemoComp = React.memo(function MemoComp({ label }: { label: string }) {
	return <span>{label}</span>;
});

export function ValidComponents() {
	return (
		<>
			<WithDefaults a="ok" />
			<MemoComp label="hi" />
		</>
	);
}

const boolSig = signal(true);
const fnSig = signal(() => {});
const keySig = signal("k");
const numSig = signal(123);

export function InvalidSignalProps() {
	return (
		<div>
			{/* @ts-expect-error boolean signal is not assignable to iframe height */}
			<iframe height={boolSig} />
			{/* @ts-expect-error number signal is not assignable to className */}
			<div className={numSig} />
			{/* @ts-expect-error signal is not assignable to event handler */}
			<button onClick={fnSig} />
			{/* @ts-expect-error signal is not assignable to key */}
			<div key={keySig} />
			{/* @ts-expect-error signal is not assignable to custom component string prop */}
			<MemoComp label={labelSig} />
			{/* @ts-expect-error signal of number is not assignable to style */}
			<div style={numSig} />
			{/* @ts-expect-error signal of number is not assignable to disabled */}
			<button disabled={numSig} />
		</div>
	);
}
