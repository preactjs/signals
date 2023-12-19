import { render } from "preact";
import { LocationProvider, Router, useLocation, lazy } from "preact-iso";
import { signal, useSignal } from "@preact/signals";
import { setFlashingEnabled, constrainFlashToChildren } from "./render-flasher";

// disable flashing during initial render:
setFlashingEnabled(false);
setTimeout(setFlashingEnabled, 100, true);

const demos = {
	Counter,
	GlobalCounter,
	DuelingCounters,
	Nesting: lazy(() => import("./nesting")),
	Animation: lazy(() => import("./animation")),
	Bench: lazy(() => import("./bench")),
};

function Demos() {
	const demo = useLocation().path.replace(/^\/demos\/?/, "");

	return (
		<div id="app">
			<header>
				<h1>
					<a href="/demos/">Demos</a>
				</h1>
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
							return <Demo path={`/demos/${demo}`} />;
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
	const count = useSignal(0);

	return (
		<div class="card">
			<button onClick={() => count.value--}>-1</button>
			<output>{count}</output>
			<button onClick={() => count.value++}>+1</button>
		</div>
	);
}

const globalCount = signal(0);
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
