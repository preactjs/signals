import "@preact/signals-debug";
import { render } from "preact";
import { LocationProvider, Router, useLocation, lazy } from "preact-iso";
import { signal, useComputed, useSignal } from "@preact/signals";
import { setFlashingEnabled, constrainFlashToChildren } from "./render-flasher";

// disable flashing during initial render:
setFlashingEnabled(false);
setTimeout(setFlashingEnabled, 100, true);

const demos = {
	Counter,
	Sum,
	GlobalCounter,
	DuelingCounters,
	Models: lazy(() => import("./todo")),
	Devtools: lazy(() => import("./devtools")),
	Nesting: lazy(() => import("./nesting")),
	Animation: lazy(() => import("./animation")),
	Bench: lazy(() => import("./bench")),
	Unmount: lazy(() => import("./Unmount")),
};

function Demos() {
	const demo = useLocation().path.replace(/^\/demos\/?/, "");
	return (
		<div id="app">
			<header>
				<nav>
					{Object.keys(demos).map(name => (
						<a href={"./" + name} class={name === demo ? "current" : ""}>
							{displayName(name)}
						</a>
					))}
				</nav>
			</header>
			<main>
				<h3>{displayName(demo)}</h3>
				<Router>
					{constrainFlashToChildren(
						Object.keys(demos).map(demo => {
							const Demo = demos[demo as keyof typeof demos];
							return <Demo path={`/${demo}`} />;
						}),
						<NotFound default />
					)}
				</Router>
			</main>
		</div>
	);
}

function NotFound() {
	return <div>Please pick a demo.</div>;
}

function displayName(name: string) {
	return name.replace(/[A-Z]/g, x => " " + x.toUpperCase());
}

function Counter() {
	const count = useSignal(0, { name: "counter" });

	return (
		<div class="card">
			<button onClick={() => count.value--}>-1</button>
			<output>{count}</output>
			<button onClick={() => count.value++}>+1</button>
		</div>
	);
}

function Sum() {
	const a = useSignal(0, { name: "a" });
	const b = useSignal(0, { name: "b" });

	const sum = useComputed(() => a.value + b.value, { name: "sum" });

	return (
		<div class="card">
			<p>
				<label>
					A:{" "}
					<input
						type="number"
						value={a}
						onInput={e => (a.value = +e.currentTarget.value)}
					/>
				</label>
			</p>
			<p>
				<label>
					B:{" "}
					<input
						type="number"
						value={b}
						onInput={e => (b.value = +e.currentTarget.value)}
					/>
				</label>
			</p>
			<output>Sum: {sum}</output>
		</div>
	);
}

const globalCount = signal(0, { name: "global-counter" });
function GlobalCounter({ explain = true }) {
	return (
		<>
			{explain && (
				<p class="info">
					This component references a global <code>signal()</code>. Try changing
					the count, navigating to a different example, then back here.
				</p>
			)}
			<div class="card">
				<button onClick={() => globalCount.value--}>-1</button>
				<output>{globalCount}</output>
				<button onClick={() => globalCount.value++}>+1</button>
			</div>
		</>
	);
}

function DuelingCounters() {
	return (
		<>
			<p class="info">
				Two instances of a counter component that both interact with a global
				Signal - changing one updates the other.
			</p>
			<GlobalCounter explain={false} />
			<GlobalCounter explain={false} />
		</>
	);
}

render(
	<LocationProvider>
		<Demos />
	</LocationProvider>,
	document.getElementById("root")!
);
