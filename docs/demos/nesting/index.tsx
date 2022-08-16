import { useRef, useMemo, useEffect, useLayoutEffect } from "preact/hooks";
import { signal, useSignal, useComputed, Signal } from "@preact/signals";
import "./style.css";

type DemoObj = Reactive<{
	stringKey: string;
	numberKey: number;
	boolKey: boolean;
}>;

type Count = Signal<number>;

type Reactive<T> = { [K in keyof T]: Signal<T[K]> };
function reactive<T extends object>(obj: T) {
	let reactive = {} as Reactive<T>;
	for (let i in obj) reactive[i] = signal(obj[i]);
	return reactive;
}
function useReactive<T extends object>(obj: T) {
	return useMemo(() => reactive(obj), []);
}

export default function Nesting() {
	const count: Count = useSignal(0);
	const add = () => count.value++;

	const showNumberKey = useSignal(false);

	const obj = useReactive({
		stringKey: "bar",
		numberKey: 123,
		boolKey: true,
		nullKey: null,
		object: { foo: "bar" },
	});

	return (
		<div class="nesting">
			<p>
				<strong>count: </strong>
				<button onClick={() => count.value--}>–</button>
				<output>{count}</output>
				<button onClick={add}>+</button>{" "}
				<button onClick={() => add() + add()}>+ ×2</button>
			</p>
			<div>
				<strong>numberKey: </strong>
				<button onClick={() => obj.numberKey.value--}>–</button>
				<output>{showNumberKey.value && obj.numberKey}</output>
				<button onClick={() => obj.numberKey.value++}>+</button>
				<label>
					<input
						type="checkbox"
						onChange={e => {
							showNumberKey.value = e.currentTarget.checked;
						}}
					/>
					show value
				</label>
			</div>
			<RenderCount />
			<ObjectEditor obj={obj} />
			<ComputedDemo count={count} />
			<Clock />
		</div>
	);
}

function ComputedDemo({ count }: { count: Count }) {
	// debugger;
	const doubleCount = useComputed(() => {
		const double = count.value * 2;
		const constrained = Math.max(0, Math.min(double, 10));
		console.log(`doubleCount(${count.value}): ${constrained}`);
		return constrained;
	});

	return (
		<div style={{ padding: "10px 0", position: "relative" }}>
			<RenderCount />
			<strong>Double Count:</strong> {doubleCount}
		</div>
	);
}

function ObjectEditor({ obj }: { obj: DemoObj }) {
	return (
		<div className="object-editor">
			<table>
				<thead>
					<tr>
						<th>Key</th>
						<th>Value</th>
						<th>Edit</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>stringKey:</td>
						<td>{obj.stringKey}</td>
						<td>
							<input
								onInput={e => (obj.stringKey.value = e.currentTarget.value)}
								value={obj.stringKey}
							/>
						</td>
					</tr>
					<tr>
						<td>numberKey:</td>
						<td>{obj.numberKey}</td>
						<td>
							<input
								type="number"
								onChange={e =>
									(obj.numberKey.value = e.currentTarget.valueAsNumber)
								}
								value={obj.numberKey}
							/>
						</td>
					</tr>
					<tr>
						<td>boolKey:</td>
						<td>{obj.boolKey}</td>
						<td>
							<input
								type="checkbox"
								onChange={e => (obj.boolKey.value = e.currentTarget.checked)}
								checked={obj.boolKey}
							/>
						</td>
					</tr>
				</tbody>
			</table>
			<RenderCount />
		</div>
	);
}

function Clock() {
	const time = useSignal(Date.now());

	useEffect(() => {
		let timer = setInterval(() => {
			time.value = Date.now();
		}, 100);
		return () => clearInterval(timer);
	}, []);

	// const date = new Date(time.value);
	// const formattedTime = date.toLocaleTimeString();

	const formattedTime = useComputed(() => {
		return new Date(time.value).toLocaleTimeString();
	});

	return (
		<div className="clock">
			<time dateTime={formattedTime}>{formattedTime}</time>
			<RenderCount />
		</div>
	);
}

/** Show render count (for demo purposes) */
function useRenderCount() {
	const count = useRef(0);
	return ++count.current;
}
function RenderCount() {
	const renders = useRenderCount();
	const $root = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => {
		$root.current!.animate([{ background: "rgba(150,100,255,.5)" }, {}], 250);
	});
	return (
		<div className="render-count" ref={$root} data-flash-ignore>
			rendered {renders} time{renders === 1 ? "" : "s"}
		</div>
	);
}
