import { signal } from "@preact/signals";
import { createElement, render, createContext } from "preact";
import { Suspense } from "preact/compat";
import { useContext, useState } from "preact/hooks";
import { act } from "preact/test-utils";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

describe("Suspense + Signals", () => {
	let scratch: HTMLDivElement;

	beforeEach(() => {
		scratch = document.createElement("div");
		document.body.appendChild(scratch);
	});

	afterEach(() => {
		render(null, scratch);
		scratch.remove();
	});

	it("should not crash when signal updates while component is suspended", async () => {
		const dataSignal = signal<string | null>(null);
		const ThemeContext = createContext("light");
		let resolvePromise: (value: string) => void;

		function DataComponent() {
			const theme = useContext(ThemeContext);
			const data = dataSignal.value;

			if (!data) {
				const promise = new Promise<string>(resolve => {
					resolvePromise = resolve;
				});
				promise.then(d => {
					dataSignal.value = d;
				});
				throw promise;
			}

			return (
				<div>
					Theme: {theme}, Data: {data}
				</div>
			);
		}

		function App() {
			return (
				<ThemeContext.Provider value="dark">
					<Suspense fallback={<div>Loading...</div>}>
						<DataComponent />
					</Suspense>
				</ThemeContext.Provider>
			);
		}

		act(() => {
			render(<App />, scratch);
		});

		expect(scratch.innerHTML).toBe("<div>Loading...</div>");

		await act(async () => {
			resolvePromise!("fetched data");
			await sleep(50);
		});

		expect(scratch.innerHTML).toBe(
			"<div>Theme: dark, Data: fetched data</div>"
		);
	});

	it("should not crash when signal updates before suspense resolves", async () => {
		const updateSignal = signal("initial");
		const ThemeContext = createContext("theme");
		let resolvePromise: () => void;

		function SuspendingWithSignal() {
			const theme = useContext(ThemeContext);
			const value = updateSignal.value;

			if (value === "initial") {
				throw new Promise<void>(resolve => {
					resolvePromise = resolve;
				});
			}

			return (
				<div>
					{value} - {theme}
				</div>
			);
		}

		act(() => {
			render(
				<ThemeContext.Provider value="test-theme">
					<Suspense fallback={<div>Loading</div>}>
						<SuspendingWithSignal />
					</Suspense>
				</ThemeContext.Provider>,
				scratch
			);
		});

		expect(scratch.innerHTML).toBe("<div>Loading</div>");

		await act(async () => {
			updateSignal.value = "updated";
			await sleep(20);
		});

		await act(async () => {
			resolvePromise!();
			await sleep(50);
		});

		expect(scratch.innerHTML).toBe("<div>updated - test-theme</div>");
	});

	it("should not crash when parent unmounts while child is suspended", async () => {
		const triggerSignal = signal(0);
		let unmountParent: () => void;

		function SuspendingChild() {
			triggerSignal.value;

			if (triggerSignal.peek() === 0) {
				throw new Promise<void>(() => {});
			}

			return <div>Child</div>;
		}

		function Parent() {
			const [show, setShow] = useState(true);
			unmountParent = () => setShow(false);

			return show ? (
				<Suspense fallback={<span>Fallback</span>}>
					<SuspendingChild />
				</Suspense>
			) : (
				<div>Unmounted</div>
			);
		}

		act(() => {
			render(<Parent />, scratch);
		});

		expect(scratch.innerHTML).toBe("<span>Fallback</span>");

		await act(async () => {
			unmountParent!();
			await sleep(10);
		});

		expect(scratch.innerHTML).toBe("<div>Unmounted</div>");

		await act(async () => {
			triggerSignal.value = 1;
			await sleep(50);
		});

		expect(scratch.innerHTML).toBe("<div>Unmounted</div>");
	});

	it("should handle signal update + unmount race condition", async () => {
		const cascadeSignal = signal("init");
		const ThemeContext = createContext("cascade");
		let unmountApp: () => void;

		function DeepChild() {
			const theme = useContext(ThemeContext);
			const value = cascadeSignal.value;

			if (value === "init") {
				throw new Promise<void>(() => {});
			}

			return <span>Deep: {value}</span>;
		}

		function App() {
			const [mounted, setMounted] = useState(true);
			unmountApp = () => setMounted(false);

			return mounted ? (
				<ThemeContext.Provider value="ctx">
					<Suspense fallback={<span>Loading</span>}>
						<DeepChild />
					</Suspense>
				</ThemeContext.Provider>
			) : (
				<div>Gone</div>
			);
		}

		act(() => {
			render(<App />, scratch);
		});

		expect(scratch.innerHTML).toContain("Loading");

		// Update signal and unmount - with the fix, no crash should occur
		await act(async () => {
			cascadeSignal.value = "updated";
			unmountApp!();
			await sleep(50);
		});

		expect(scratch.innerHTML).toBe("<div>Gone</div>");
	});

	it("should handle rapid mount/unmount with signal updates", async () => {
		const rapidSignal = signal(0);
		const ThemeContext = createContext("rapid");
		let toggleMount: () => void;

		function RapidComponent() {
			useContext(ThemeContext);
			rapidSignal.value;

			if (rapidSignal.peek() === 0) {
				throw new Promise<void>(() => {});
			}

			return <div>Rapid</div>;
		}

		function Container() {
			const [mounted, setMounted] = useState(true);
			toggleMount = () => setMounted(m => !m);

			return (
				<ThemeContext.Provider value="ctx">
					{mounted ? (
						<Suspense fallback={<span>Loading</span>}>
							<RapidComponent />
						</Suspense>
					) : (
						<div>Off</div>
					)}
				</ThemeContext.Provider>
			);
		}

		act(() => {
			render(<Container />, scratch);
		});

		expect(scratch.innerHTML).toBe("<span>Loading</span>");

		// Rapid mount/unmount with signal updates - with fix, no crash
		for (let i = 0; i < 5; i++) {
			await act(async () => {
				rapidSignal.value = i + 1;
				toggleMount!();
				await sleep(1);
			});
			await act(async () => {
				toggleMount!();
				await sleep(1);
			});
		}

		// Should complete without errors - component unsuspends because signal > 0
		expect(scratch.innerHTML).toBe("<div>Rapid</div>");
	});
});
