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
	TwoGlobalCounters,
	Nesting: lazy(() => import("./nesting")),
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
function GlobalCounter() {
	return (
		<div class="card">
			<button onClick={() => globalCount.value--}>-1</button>
			<output>{globalCount}</output>
			<button onClick={() => globalCount.value++}>+1</button>
		</div>
	);
}

function TwoGlobalCounters() {
	return (
		<>
			<GlobalCounter />
			<GlobalCounter />
		</>
	);
}

render(
	<LocationProvider>
		<Demos />
	</LocationProvider>,
	document.getElementById("root")!
);