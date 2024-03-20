import { signal, computed, effect, Signal } from "@preact/signals-core";
import { setFlashingEnabled } from "./render-flasher";
import { useEffect, useMemo } from "preact/hooks";

interface Benchmark {
	name: string;
	note?: string;
	benchmark(): { run: (iteration: number) => void; cleanup?: () => void };
}
const BENCHMARKS: Benchmark[] = [];
function bench(name: string, benchmark: Benchmark["benchmark"], note?: string) {
	BENCHMARKS.push({ name, note, benchmark });
}

bench("Counter", () => {
	const s = signal(0);
	const results = [];
	const cleanup = effect(() => {
		if (results.push(s.value) === 10) results.length = 0;
	});
	return {
		run() {
			s.value++;
		},
		cleanup,
	};
});

bench("Computed tree", () => {
	const toHex = (num: number) => num.toString(16).padStart(2, "0");

	const r = signal(0);
	const g = signal(0);
	const b = signal(0);

	const ri = computed(() => 255 - +r);
	const gi = computed(() => 255 - +g);
	const bi = computed(() => 255 - +b);

	const rgb = computed(() => `rgb(${r}, ${g}, ${b})`);
	const rgbi = computed(() => `rgb(${ri}, ${gi}, ${bi})`);

	const hex = computed(() => `#${toHex(+r)}${toHex(+g)}${toHex(+b)}`);
	const hexi = computed(() => `#${toHex(+ri)}${toHex(+gi)}${toHex(+bi)}`);

	const css = computed(() => `color: ${rgb}; background-color: ${rgbi};`);
	const cssHex = computed(() => `color: ${hex}; background-color: ${hexi};`);

	const outputs = [];
	let last: string;
	const cleanup = effect(() => {
		const fullCss = `${css} ${cssHex}`;
		last = fullCss;
		if (outputs.push(fullCss) === 10) {
			outputs.length = 0;
		}
	});

	return {
		run(i) {
			r.value = i % 255;
			g.value = (i / 5) % 255 | 0;
			b.value = (i / 10) % 255 | 0;
		},
		cleanup() {
			console.log(last);
			cleanup();
		},
	};
});

bench("Short computed chain", () => {
	const source = signal(0);
	let tail = source;
	for (let i = 0; i < 10; i++) {
		let from = tail;
		tail = computed(() => +from + 1);
	}
	return {
		run(i) {
			source.value = i;
			if (tail.value !== i + 10) {
				throw Error(
					`Expected source value ${i} to chain to ${i + 10} but got ${
						tail.value
					}`
				);
			}
		},
	};
});

bench(
	"Long computed chain",
	() => {
		const source = signal(0);
		let tail = source;
		for (let i = 0; i < 1000; i++) {
			let from = tail;
			tail = computed(() => +from + 1);
		}
		return {
			run(i) {
				source.value = i;
				if (tail.value !== i + 1000) {
					throw Error(
						`Expected source value ${i} to chain to ${i + 1000} but got ${
							tail.value
						}`
					);
				}
			},
		};
	},
	"Should be 100x faster than short"
);

bench(
	"Wide computed tree (pull)",
	() => {
		const source = signal(0);
		const computeds: Signal<number>[] = [];
		for (let i = 0; i < 1000; i++) {
			computeds[i] = computed(() => +source + i);
		}
		return {
			run(iteration) {
				source.value = iteration;
				for (let i = 0; i < 1000; i++) {
					const expected = iteration + i;
					const actual = computeds[i].value;
					if (actual !== expected) {
						throw Error(
							`Expected computeds[${i}] value ${expected} but got ${actual}`
						);
					}
				}
			},
		};
	},
	"Manual computed value access"
);

bench(
	"Wide computed tree to narrow effect",
	() => {
		const source = signal(0);
		const computeds: Signal<number>[] = [];
		const results = [];
		for (let i = 0; i < 1000; i++) {
			computeds[i] = computed(() => +source + i);
		}
		const cleanup = effect(() => {
			let total = 0;
			for (let i = 0; i < 1000; i++) total += computeds[i].value;
			if (results.push(total) === 10) results.length = 0;
		});
		return {
			run(iteration) {
				source.value = iteration;
			},
			cleanup,
		};
	},
	"source → 1000 computeds → effect"
);

bench(
	"Wide computed and effect tree",
	() => {
		const source = signal(0);
		const computeds: Signal<number>[] = [];
		const cleanups: (() => void)[] = [];
		const results = [];
		for (let i = 0; i < 1000; i++) {
			const comp = computed(() => +source + i);
			computeds[i] = comp;
			cleanups[i] = effect(() => {
				if (results.push(comp.value) === 10) results.length = 0;
			});
		}
		return {
			run(iteration) {
				source.value = iteration;
			},
			cleanup() {
				for (let i = 0; i < 1000; i++) cleanups[i]();
			},
		};
	},
	"source → 1000 ✕ (computed → effect)"
);

// --- ui/runner stuff

function runBenchmark({ name, benchmark }: Benchmark) {
	try {
		const ctx = benchmark();
		const { run, cleanup } = ctx;
		const start = performance.now();
		let elapsed = 0;
		let iterations = 0;
		do {
			run(iterations++);
		} while ((elapsed = performance.now() - start) < 1000);
		if (cleanup) cleanup();
		const hz = (iterations / elapsed) * 1000;
		console.log(`${name}: ${hz.toLocaleString()}Hz`);
		return { name, hz, iterations, elapsed };
	} catch (error) {
		return { name, error };
	}
}

const sleep = (ms?: number) => new Promise(resolve => setTimeout(resolve, ms));

function createRunner() {
	const running = signal(false);
	const results = BENCHMARKS.map(({ name }) =>
		signal<ReturnType<typeof runBenchmark> | { name: string }>({ name })
	);
	const total = signal(0);
	async function run() {
		running.value = true;
		total.value = 0;
		await sleep(100);
		for (let i = 0; i < BENCHMARKS.length; i++) {
			const benchmark = BENCHMARKS[i];
			const start = performance.now();
			const result = runBenchmark(benchmark);
			total.value += performance.now() - start;
			results[i].value = result;
			await sleep(100);
		}
		running.value = false;
		console.log(`Finished in ${total.value.toFixed(2)}ms`);
	}
	return { run, running, results, total };
}

export default function Runner() {
	useEffect(() => {
		setFlashingEnabled(false);
		return () => setFlashingEnabled(true);
	}, []);

	const runner = useMemo(createRunner, []);

	return (
		<div class="benchmark" data-flash-ignore>
			<section>
				<button disabled={runner.running} onClick={runner.run}>
					Run Benchmarks
				</button>{" "}
				{runner.running.value ? (
					<span>Running...</span>
				) : runner.total.value ? (
					<span>✅ Ran in {Number((+runner.total / 1000).toFixed(3))}s</span>
				) : null}
			</section>

			<table>
				<thead>
					<tr>
						<th>Benchmark</th>
						<th>Speed (runs/second)</th>
						<th>Note</th>
					</tr>
				</thead>
				<tbody>
					{runner.results.map(({ value: result }, index) => (
						<tr>
							<td>{result.name}</td>
							{"error" in result ? (
								<td>{result.error + ""}</td>
							) : "hz" in result ? (
								<td title={`${result.iterations} in ${result.elapsed}`}>
									{(result.hz | 0).toLocaleString()} / sec
								</td>
							) : (
								<td>...</td>
							)}
							<td style="font-size:80%;">{BENCHMARKS[index].note}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
