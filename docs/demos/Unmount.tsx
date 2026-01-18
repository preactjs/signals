import { useSignal } from "@preact/signals";
import { signal, computed } from "@preact/signals-core";
import "@preact/signals-devtools-ui/styles";
import "./devtools.css";
import { EmbeddedDevTools } from "./EmbeddedDevtools";

// Shared signal that multiple components will subscribe to
const sharedCounter = signal(0, { name: "sharedCounter" });

// Computed that depends on sharedCounter
const doubleCounter = computed(() => sharedCounter.value * 2, {
	name: "doubleCounter",
});

// Counter component that subscribes to the shared signal
function Counter({ id }: { id: number }) {
	// This component reads the shared signal, so it should be tracked as an owner
	const count = sharedCounter.value;
	const double = doubleCounter.value;

	return (
		<div class="counter-instance" data-id={id}>
			<h3>Counter Instance #{id}</h3>
			<p>
				Count: {count} | Double: {double}
			</p>
		</div>
	);
}

export default function UnmountTestDemo() {
	const showFirstCounter = useSignal(true, { name: "showFirstCounter" });
	const showSecondCounter = useSignal(true, { name: "showSecondCounter" });

	return (
		<div class="devtools-demo-container">
			<div class="app-section">
				<h1>Component Unmount Test</h1>
				<p>
					This demo tests that when 2 components of the same type are mounted:
				</p>
				<ol>
					<li>Both are tracked as owners of the shared signal</li>
					<li>
						When one unmounts, the signal still shows the remaining component
					</li>
					<li>
						When both unmount, the signal no longer shows any component owners
					</li>
				</ol>

				<div class="controls">
					<h2>Controls</h2>
					<button onClick={() => (sharedCounter.value += 1)}>
						Increment Counter (current: {sharedCounter.value})
					</button>

					<div class="toggle-buttons">
						<button
							onClick={() => (showFirstCounter.value = !showFirstCounter.value)}
						>
							{showFirstCounter.value
								? "Hide First Counter"
								: "Show First Counter"}
						</button>
						<button
							onClick={() =>
								(showSecondCounter.value = !showSecondCounter.value)
							}
						>
							{showSecondCounter.value
								? "Hide Second Counter"
								: "Show Second Counter"}
						</button>
					</div>
				</div>

				<div class="counters">
					<h2>
						Counter Instances (
						{(showFirstCounter.value ? 1 : 0) +
							(showSecondCounter.value ? 1 : 0)}{" "}
						mounted)
					</h2>

					{showFirstCounter.value && <Counter id={1} />}
					{showSecondCounter.value && <Counter id={2} />}

					{!showFirstCounter.value && !showSecondCounter.value && (
						<p class="no-counters">
							No counters mounted. The sharedCounter signal should no longer
							show any component owners.
						</p>
					)}
				</div>

				<div class="instructions">
					<h2>Testing Instructions</h2>
					<ol>
						<li>Open the DevTools panel (or embedded devtools below)</li>
						<li>
							Click "Increment Counter" and verify both Counter components are
							shown as owners in the graph
						</li>
						<li>Click "Hide First Counter" to unmount it</li>
						<li>
							Click "Increment Counter" again - only the second Counter should
							be shown as owner
						</li>
						<li>Click "Hide Second Counter" to unmount it</li>
						<li>
							Click "Increment Counter" - no component should be shown as owner
							of the signal
						</li>
					</ol>
				</div>
			</div>
			<div class="devtools-section">
				<EmbeddedDevTools />
			</div>
		</div>
	);
}
