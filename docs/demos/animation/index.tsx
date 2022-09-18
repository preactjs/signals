import { useEffect } from "preact/hooks";
import { useSignal, useComputed, Signal } from "@preact/signals";
import "./style.css";
import { setFlashingEnabled } from "../render-flasher";

const COUNT = 200;
const LOOPS = 6;

export default function Animation() {
	const x = useSignal(0);
	const y = useSignal(0);
	const big = useSignal(false);
	const counter = useSignal(0);

	useEffect(() => {
		let touch = navigator.maxTouchPoints > 1;

		// set mouse position state on move:
		function move(e: MouseEvent | TouchEvent) {
			const pointer = "touches" in e ? e.touches[0] : e;
			x.value = pointer.clientX;
			y.value = pointer.clientY - 52;
		}
		// holding the mouse down enables big mode:
		function setBig(e: Event) {
			big.value = true;
			e.preventDefault();
		}
		function notBig() {
			big.value = false;
		}
		addEventListener(touch ? "touchmove" : "mousemove", move);
		addEventListener(touch ? "touchstart" : "mousedown", setBig);
		addEventListener(touch ? "touchend" : "mouseup", notBig);

		let running = true;
		function tick() {
			if (running === false) return;
			counter.value++;
			requestAnimationFrame(tick);
		}
		requestAnimationFrame(tick);

		setFlashingEnabled(false);
		setTimeout(() => setFlashingEnabled(false), 150);

		return () => {
			running = false;
			setFlashingEnabled(true);
			removeEventListener(touch ? "touchmove" : "mousemove", move);
			removeEventListener(touch ? "touchstart" : "mousedown", setBig);
			removeEventListener(touch ? "touchend" : "mouseup", notBig);
		};
	}, []);

	const max = useComputed(() => {
		return (
			COUNT +
			Math.round(Math.sin((counter.value / 90) * 2 * Math.PI) * COUNT * 0.5)
		);
	});

	let circles = [];

	// the advantage of JSX is that you can use the entirety of JS to "template":
	for (let i = max.value; i--; ) {
		circles[i] = (
			<Circle i={i} x={x} y={y} big={big} max={max} counter={counter} />
		);
	}

	return (
		<div class="animation">
			<Circle i={0} x={x} y={y} big={big} max={max} counter={counter} label />
			{circles}
		</div>
	);
}

interface CircleProps {
	i: number;
	x: Signal<number>;
	y: Signal<number>;
	big: Signal<boolean>;
	max: Signal<number>;
	counter: Signal<number>;
	label?: boolean;
}

/** Represents a single coloured dot. */
function Circle({ label, i, x, y, big, max, counter }: CircleProps) {
	const hue = useComputed(() => {
		let f = (i / max.value) * LOOPS;
		return (f * 255 + counter.value * 10) % 255;
	});

	const offsetX = useComputed(() => {
		let f = (i / max.value) * LOOPS;
		let θ = f * 2 * Math.PI;
		return Math.sin(θ) * (20 + i * 2);
	});

	const offsetY = useComputed(() => {
		let f = (i / max.value) * LOOPS;
		let θ = f * 2 * Math.PI;
		return Math.cos(θ) * (20 + i * 2);
	});

	// For testing nested "computeds-only" components (for GC):
	// 	return <CircleInner {...{ label, x, y, offsetX, offsetY, hue, big }} />;
	// }
	// function CircleInner({ label, x, y, offsetX, offsetY, hue, big }) {

	const style = useComputed(() => {
		let left = (x.value + offsetX.value) | 0;
		let top = (y.value + offsetY.value) | 0;
		return `left:${left}px; top:${top}px; border-color:hsl(${hue},100%,50%);`;
	});

	const cl = useComputed(() => {
		let cl = "circle";
		if (label) cl += " label";
		if (big.value) cl += " big";
		return cl;
	});

	return (
		<div class={cl} style={style}>
			{label && <Label x={x} y={y} />}
		</div>
	);
}

function Label({ x, y }: { x: Signal<number>; y: Signal<number> }) {
	return (
		<span class="label">
			{x},{y}
		</span>
	);
}
