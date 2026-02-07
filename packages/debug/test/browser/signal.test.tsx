/// <reference types="@vitest/browser-playwright" />
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cdp } from "@vitest/browser/context";
import {
	signal,
	computed,
	effect,
	batch,
	ReadonlySignal,
} from "@preact/signals-core";
import { setDebugOptions } from "@preact/signals-debug";

describe("Signal Debug", () => {
	let consoleSpy: ReturnType<typeof vi.spyOn>;
	let groupSpy: ReturnType<typeof vi.spyOn>;
	let groupEndSpy: ReturnType<typeof vi.spyOn>;
	let groupCollapsedSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		consoleSpy = vi.spyOn(console, "log");
		groupSpy = vi.spyOn(console, "group");
		groupCollapsedSpy = vi.spyOn(console, "groupCollapsed");
		groupEndSpy = vi.spyOn(console, "groupEnd");
		setDebugOptions({ grouped: true, enabled: true, spacing: 2 });
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("Basic Signal Updates", () => {
		it("should log simple signal updates", async () => {
			const count = signal(0, { name: "count" });
			count.subscribe(() => {});
			count.value = 1;

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(groupSpy).toHaveBeenCalledWith("🎯 Signal Update: count");
			expect(consoleSpy).toHaveBeenCalledWith("From:", "0");
			expect(consoleSpy).toHaveBeenCalledWith("To:", "1");
			expect(groupCollapsedSpy).toHaveBeenCalledWith(
				"  ↪️ Triggered effect: count-subscribe"
			);
			expect(groupEndSpy).toHaveBeenCalledTimes(2);
		});

		it("should handle object values correctly", async () => {
			const user = signal({ name: "John" }, { name: "user" });
			user.subscribe(() => {});
			user.value = { name: "Jane" };

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(groupSpy).toHaveBeenCalledWith("🎯 Signal Update: user");
			expect(consoleSpy).toHaveBeenCalledWith("From:", '{"name":"John"}');
			expect(consoleSpy).toHaveBeenCalledWith("To:", '{"name":"Jane"}');
		});

		it("should handle undefined and null values", async () => {
			const nullable = signal<string | null>(null, { name: "nullable" });
			nullable.subscribe(() => {});
			nullable.value = "test";

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(groupSpy).toHaveBeenCalledWith("🎯 Signal Update: nullable");
			expect(consoleSpy).toHaveBeenCalledWith("From:", "null");
			expect(consoleSpy).toHaveBeenCalledWith("To:", "test");
		});
	});

	describe("Computed Signal Updates", () => {
		it("should show cascading updates from computed signals", async () => {
			const count = signal(0, { name: "count" });
			const doubled = computed(() => count.value * 2, { name: "doubled" });
			doubled.subscribe(() => {});

			count.value = 2;

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(groupSpy).toHaveBeenCalledWith("🎯 Signal Update: count");
			expect(groupCollapsedSpy).toHaveBeenCalledWith(
				"  ↪️ Triggered update: doubled"
			);
			expect(consoleSpy).toHaveBeenCalledWith("  Type: Computed");
		});

		it("should handle nested computed signals", async () => {
			const count = signal(0, { name: "count" });
			const doubled = computed(() => count.value * 2, { name: "doubled" });
			const message = computed(() => `Value: ${doubled.value}`, {
				name: "message",
			});
			message.subscribe(() => {});

			count.value = 2;

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(groupSpy).toHaveBeenCalledWith("🎯 Signal Update: count");
			expect(groupCollapsedSpy).toHaveBeenCalledWith(
				"  ↪️ Triggered update: doubled"
			);
			expect(groupCollapsedSpy).toHaveBeenCalledWith(
				"    ↪️ Triggered update: message"
			);
		});

		it("should handle nested computed signals", async () => {
			const count = signal(0, { name: "count" });
			const doubled = computed(() => count.value * 2, { name: "doubled" });
			const tripled = computed(() => count.value * 3, { name: "tripled" });
			tripled.subscribe(() => {});
			doubled.subscribe(() => {});

			count.value = 2;

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(groupSpy).toHaveBeenCalledWith("🎯 Signal Update: count");
			expect(groupCollapsedSpy).toHaveBeenCalledWith(
				"  ↪️ Triggered update: tripled"
			);
			expect(groupCollapsedSpy).toHaveBeenCalledWith(
				"  ↪️ Triggered update: doubled"
			);
		});

		it("should handle computeds that depend on multiple signals", async () => {
			const count = signal(0, { name: "count" });
			const count2 = signal(0, { name: "count2" });
			const sum = computed(() => count.value + count2.value, { name: "sum" });
			sum.subscribe(() => {});

			count2.value = 2;

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(groupSpy).toHaveBeenCalledWith("🎯 Signal Update: count2");
			expect(groupCollapsedSpy).toHaveBeenCalledWith(
				"  ↪️ Triggered update: sum"
			);
		});
	});

	describe("Batched Signal Updates", () => {
		it("should show batched signal updates", async () => {
			const count = signal(0, { name: "count" });
			const count2 = signal(0, { name: "count2" });
			const sum = computed(() => count.value + count2.value, { name: "sum" });
			sum.subscribe(() => {});

			batch(() => {
				count.value = 2;
				count2.value = 3;
			});

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(groupSpy).toHaveBeenCalledWith("🎯 Signal Update: count");
			expect(groupCollapsedSpy).toHaveBeenCalledWith(
				"  ↪️ Triggered update: sum"
			);
			expect(consoleSpy).toHaveBeenCalledWith("  Type: Computed");
		});

		it("should show batched signal updates w/ independent subscribers", async () => {
			const count = signal(0, { name: "count" });
			const count2 = signal(0, { name: "count2" });
			const doubled = computed(() => count.value * 2, { name: "doubled" });
			const doubled2 = computed(() => count2.value * 2, { name: "doubled2" });
			doubled.subscribe(() => {});
			doubled2.subscribe(() => {});

			batch(() => {
				count.value = 2;
				count2.value = 3;
			});

			await new Promise(resolve => setTimeout(resolve, 0));

			// Should have two groups
			expect(groupSpy).toHaveBeenCalledWith("🎯 Signal Update: count");
			expect(groupCollapsedSpy).toHaveBeenCalledWith(
				"  ↪️ Triggered update: doubled2"
			);
			expect(consoleSpy).toHaveBeenCalledWith("  Type: Computed");
			expect(groupSpy).toHaveBeenCalledWith("🎯 Signal Update: count2");
			expect(groupCollapsedSpy).toHaveBeenCalledWith(
				"  ↪️ Triggered update: doubled"
			);
		});
	});

	describe("Effect Updates", () => {
		it("should show effect updates", async () => {
			const count = signal(0, { name: "count" });
			effect(
				() => {
					count.value;
				},
				{ name: "count-effect" }
			);

			count.value = 2;

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(groupSpy).toHaveBeenCalledWith("🎯 Signal Update: count");
			expect(groupCollapsedSpy).toHaveBeenCalledWith(
				"  ↪️ Triggered effect: count-effect"
			);
			expect(groupEndSpy).toHaveBeenCalledTimes(2);
		});

		it("should show effect deep updates", async () => {
			const count = signal(0, { name: "count" });
			const doubled = computed(() => count.value * 2, { name: "doubled" });
			effect(
				() => {
					doubled.value;
				},
				{ name: "logger" }
			);

			count.value = 2;

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(groupSpy).toHaveBeenCalledWith("🎯 Signal Update: count");
			expect(groupCollapsedSpy).toHaveBeenCalledWith(
				"  ↪️ Triggered update: doubled"
			);
			expect(groupCollapsedSpy).toHaveBeenCalledWith(
				"    ↪️ Triggered effect: logger"
			);
			expect(groupEndSpy).toHaveBeenCalledTimes(3);
		});
	});

	describe("Debug Options", () => {
		it("should respect enabled/disabled setting", async () => {
			const count = signal(0, { name: "count" });
			count.subscribe(() => {});

			setDebugOptions({ enabled: false });
			count.value = 1;

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(groupSpy).not.toHaveBeenCalled();
			expect(consoleSpy).not.toHaveBeenCalled();
		});

		it("should support flat logging mode", async () => {
			const count = signal(0, { name: "count" });
			const doubled = computed(() => count.value * 2, { name: "doubled" });
			doubled.subscribe(() => {});

			setDebugOptions({ grouped: false });
			count.value = 2;

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(groupSpy).not.toHaveBeenCalled();
			expect(consoleSpy).toHaveBeenCalledWith("🎯 count: 0 → 2");
			expect(consoleSpy).toHaveBeenCalledWith("↪️ doubled: 0 → 4");
		});
	});

	it("should not recompute dependencies unnecessarily", () => {
		const spy = vi.fn();
		const a = signal(0);
		const b = signal(0);
		const c = computed(() => {
			b.value;
			spy();
		});
		effect(() => {
			if (a.value === 0) {
				c.value;
			}
		});
		expect(spy).toHaveBeenCalledOnce();

		batch(() => {
			b.value = 1;
			a.value = 1;
		});
		expect(spy).toHaveBeenCalledOnce();
	});

	it("should be garbage collectable after it has lost all of its listeners", async () => {
		const s = signal(0);
		const cdpSession = cdp();

		// @ts-expect-error
		await cdpSession.send("HeapProfiler.enable");

		let ref: WeakRef<ReadonlySignal>;
		let dispose: () => void;
		(function () {
			const c = computed(() => s.value);
			ref = new WeakRef(c);
			dispose = effect(() => {
				c.value;
			});
		})();

		dispose();
		// @ts-expect-error
		await cdpSession.send("HeapProfiler.collectGarbage");
		await new Promise(resolve => setTimeout(resolve, 0));
		// @ts-expect-error
		await cdpSession.send("HeapProfiler.collectGarbage");
		expect(ref.deref()).to.be.undefined;
	});

	it("should only subscribe to signals listened to", () => {
		// Here both "B" and "C" are active in the beginning, but
		// "B" becomes inactive later. At that point it should
		// not receive any updates anymore.
		//    *A
		//   /   \
		// *B     D <- we don't listen to C
		//  |
		// *C
		const a = signal("a");
		const spyB = vi.fn(() => a.value);
		const b = computed(spyB);

		const spyC = vi.fn(() => b.value);
		const c = computed(spyC);

		const d = computed(() => a.value);

		let result = "";
		const unsub = effect(() => {
			result = c.value;
		});

		expect(result).to.equal("a");
		expect(d.value).to.equal("a");

		spyB.mockClear();
		spyC.mockClear();
		unsub();

		a.value = "aa";

		expect(spyB).not.toHaveBeenCalled();
		expect(spyC).not.toHaveBeenCalled();
		expect(d.value).to.equal("aa");
	});

	describe("bubbleUpToBaseSignal - Multiple Sources", () => {
		it("should trace back to base signal through second source in linked list", async () => {
			// This test verifies that when an effect depends on multiple signals,
			// the debug tracing can find inflight updates through any source,
			// not just the first one in the linked list.
			//
			// Effect structure:
			//   showFirst  sharedCounter
			//       \        /
			//        \      /
			//      effectWithMultipleSources
			//
			const sharedCounter = signal(0, { name: "sharedCounter" });
			const showFirst = signal(true, { name: "showFirst" });

			// This effect reads showFirst first, then sharedCounter
			// So in the linked list, sharedCounter will NOT be first
			const effectSpy = vi.fn();
			effect(
				() => {
					showFirst.value; // First dependency
					sharedCounter.value; // Second dependency - this is what we update
					effectSpy();
				},
				{ name: "multiSourceEffect" }
			);

			effectSpy.mockClear();
			consoleSpy.mockClear();
			groupSpy.mockClear();
			groupCollapsedSpy.mockClear();

			// Now update sharedCounter - the bubbleUpToBaseSignal should find it
			// even though it's the second source in the effect's dependency list
			sharedCounter.value = 1;

			await new Promise(resolve => setTimeout(resolve, 0));

			// The effect should have been triggered
			expect(effectSpy).toHaveBeenCalledOnce();

			// Debug logging should show the connection from sharedCounter to the effect
			expect(groupSpy).toHaveBeenCalledWith("🎯 Signal Update: sharedCounter");
			expect(groupCollapsedSpy).toHaveBeenCalledWith(
				"  ↪️ Triggered effect: multiSourceEffect"
			);
		});

		it("should trace back to base signal through third or later source", async () => {
			// Test with even more sources to ensure the fix handles arbitrary positions
			const sig1 = signal("a", { name: "sig1" });
			const sig2 = signal("b", { name: "sig2" });
			const sig3 = signal("c", { name: "sig3" });
			const sig4 = signal("d", { name: "sig4" });

			const effectSpy = vi.fn();
			effect(
				() => {
					// Read in order: sig1, sig2, sig3, sig4
					sig1.value;
					sig2.value;
					sig3.value;
					sig4.value;
					effectSpy();
				},
				{ name: "manySourcesEffect" }
			);

			effectSpy.mockClear();
			groupSpy.mockClear();
			groupCollapsedSpy.mockClear();

			// Update the last signal in the dependency list
			sig4.value = "d2";

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(effectSpy).toHaveBeenCalledOnce();
			expect(groupSpy).toHaveBeenCalledWith("🎯 Signal Update: sig4");
			expect(groupCollapsedSpy).toHaveBeenCalledWith(
				"  ↪️ Triggered effect: manySourcesEffect"
			);
		});

		it("should trace through computed with multiple sources to find correct base signal", async () => {
			// Test that the recursive search also handles multiple sources correctly
			//
			//   count1   count2
			//      \      /
			//       \    /
			//        sum (computed)
			//         |
			//       effect
			//
			const count1 = signal(0, { name: "count1" });
			const count2 = signal(0, { name: "count2" });
			const sum = computed(() => count1.value + count2.value, { name: "sum" });

			const effectSpy = vi.fn();
			effect(
				() => {
					sum.value;
					effectSpy();
				},
				{ name: "sumEffect" }
			);

			effectSpy.mockClear();
			groupSpy.mockClear();
			groupCollapsedSpy.mockClear();

			// Update count2 (not the first source of sum)
			count2.value = 5;

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(effectSpy).toHaveBeenCalledOnce();
			expect(groupSpy).toHaveBeenCalledWith("🎯 Signal Update: count2");
			expect(groupCollapsedSpy).toHaveBeenCalledWith(
				"  ↪️ Triggered update: sum"
			);
			expect(groupCollapsedSpy).toHaveBeenCalledWith(
				"    ↪️ Triggered effect: sumEffect"
			);
		});

		it("should trace through nested computeds with multiple sources", async () => {
			// More complex dependency graph:
			//
			//     a       b
			//      \     /
			//       \   /
			//       comp1 (a + b)
			//          \
			//     c     \
			//      \     \
			//       \     \
			//        comp2 (c + comp1)
			//          |
			//        effect
			//
			const a = signal(1, { name: "a" });
			const b = signal(2, { name: "b" });
			const c = signal(3, { name: "c" });

			const comp1 = computed(() => a.value + b.value, { name: "comp1" });
			const comp2 = computed(() => c.value + comp1.value, { name: "comp2" });

			const effectSpy = vi.fn();
			effect(
				() => {
					comp2.value;
					effectSpy();
				},
				{ name: "nestedEffect" }
			);

			effectSpy.mockClear();
			groupSpy.mockClear();
			groupCollapsedSpy.mockClear();

			// Update b (second source of comp1, which is second source of comp2)
			b.value = 10;

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(effectSpy).toHaveBeenCalledOnce();
			expect(groupSpy).toHaveBeenCalledWith("🎯 Signal Update: b");
			expect(groupCollapsedSpy).toHaveBeenCalledWith(
				"  ↪️ Triggered update: comp1"
			);
			expect(groupCollapsedSpy).toHaveBeenCalledWith(
				"    ↪️ Triggered update: comp2"
			);
			expect(groupCollapsedSpy).toHaveBeenCalledWith(
				"      ↪️ Triggered effect: nestedEffect"
			);
		});
	});

	describe("allDependencies - Complete Dependency Tracking", () => {
		it("should include all dependencies for a computed with multiple sources", async () => {
			const count1 = signal(0, { name: "count1" });
			const count2 = signal(0, { name: "count2" });
			const sum = computed(() => count1.value + count2.value, { name: "sum" });
			sum.subscribe(() => {});

			// Capture updates sent to devtools
			const updates: any[] = [];
			const unsubscribe = window.__PREACT_SIGNALS_DEVTOOLS__.onUpdate(
				newUpdates => {
					updates.push(...newUpdates);
				}
			);

			// Update one signal
			count1.value = 5;

			await new Promise(resolve => setTimeout(resolve, 0));
			unsubscribe();

			// Find the update for the 'sum' computed
			const sumUpdate = updates.find(u => u.signalName === "sum");
			expect(sumUpdate).toBeDefined();
			expect(sumUpdate.allDependencies).toBeDefined();
			expect(sumUpdate.allDependencies).toHaveLength(2);

			// Find the signal IDs for count1 and count2
			const count1Update = updates.find(u => u.signalName === "count1");
			expect(count1Update).toBeDefined();

			// allDependencies should include both count1 and count2
			// We can verify by checking that there are 2 dependencies
			expect(sumUpdate.allDependencies.length).toBe(2);
		});

		it("should include rich dependency info with id, name, and type", async () => {
			const count1 = signal(0, { name: "count1" });
			const doubled = computed(() => count1.value * 2, { name: "doubled" });
			const sum = computed(() => count1.value + doubled.value, { name: "sum" });
			sum.subscribe(() => {});

			// Capture updates sent to devtools
			const updates: any[] = [];
			const unsubscribe = window.__PREACT_SIGNALS_DEVTOOLS__.onUpdate(
				newUpdates => {
					updates.push(...newUpdates);
				}
			);

			// Update the base signal
			count1.value = 5;

			await new Promise(resolve => setTimeout(resolve, 0));
			unsubscribe();

			// Find the update for the 'sum' computed
			const sumUpdate = updates.find(u => u.signalName === "sum");
			expect(sumUpdate).toBeDefined();
			expect(sumUpdate.allDependencies).toBeDefined();
			expect(sumUpdate.allDependencies).toHaveLength(2);

			// Each dependency should have id, name, and type
			for (const dep of sumUpdate.allDependencies) {
				expect(dep).toHaveProperty("id");
				expect(dep).toHaveProperty("name");
				expect(dep).toHaveProperty("type");
				expect(typeof dep.id).toBe("string");
				expect(typeof dep.name).toBe("string");
				expect(["signal", "computed"]).toContain(dep.type);
			}

			// Check that we have one signal dependency (count1) and one computed dependency (doubled)
			const signalDep = sumUpdate.allDependencies.find(
				(d: any) => d.type === "signal"
			);
			const computedDep = sumUpdate.allDependencies.find(
				(d: any) => d.type === "computed"
			);
			expect(signalDep).toBeDefined();
			expect(computedDep).toBeDefined();
			expect(signalDep.name).toBe("count1");
			expect(computedDep.name).toBe("doubled");
		});

		it("should provide dependency names for graph rendering without updates", async () => {
			// This test verifies that the rich dependency info enables the graph
			// to show dependencies even if they haven't had their own updates.
			// Previously only signal IDs were sent, which wasn't enough to render nodes.
			const base1 = signal(0, { name: "base1" });
			const base2 = signal(0, { name: "base2" });
			const combined = computed(() => base1.value + base2.value, {
				name: "combined",
			});
			combined.subscribe(() => {});

			// Capture updates sent to devtools
			const updates: any[] = [];
			const unsubscribe = window.__PREACT_SIGNALS_DEVTOOLS__.onUpdate(
				newUpdates => {
					updates.push(...newUpdates);
				}
			);

			// Only update base1 - base2 never sends an update
			base1.value = 5;

			await new Promise(resolve => setTimeout(resolve, 0));
			unsubscribe();

			// Find the update for 'combined'
			const combinedUpdate = updates.find(u => u.signalName === "combined");
			expect(combinedUpdate).toBeDefined();
			expect(combinedUpdate.allDependencies).toBeDefined();
			expect(combinedUpdate.allDependencies).toHaveLength(2);

			// Both dependencies should have names, even base2 which never updated
			const base2Dep = combinedUpdate.allDependencies.find(
				(d: any) => d.name === "base2"
			);
			expect(base2Dep).toBeDefined();
			expect(base2Dep.type).toBe("signal");
			expect(base2Dep.id).toBeDefined();
		});

		it("should include all dependencies for an effect with multiple sources", async () => {
			const sig1 = signal("a", { name: "sig1" });
			const sig2 = signal("b", { name: "sig2" });
			const sig3 = signal("c", { name: "sig3" });

			effect(
				() => {
					sig1.value;
					sig2.value;
					sig3.value;
				},
				{ name: "multiEffect" }
			);

			// Capture updates sent to devtools
			const updates: any[] = [];
			const unsubscribe = window.__PREACT_SIGNALS_DEVTOOLS__.onUpdate(
				newUpdates => {
					updates.push(...newUpdates);
				}
			);

			// Update one signal
			sig2.value = "b2";

			await new Promise(resolve => setTimeout(resolve, 0));
			unsubscribe();

			// Find the update for the 'multiEffect'
			const effectUpdate = updates.find(u => u.signalName === "multiEffect");
			expect(effectUpdate).toBeDefined();
			expect(effectUpdate.allDependencies).toBeDefined();
			expect(effectUpdate.allDependencies).toHaveLength(3);
		});

		it("should show nested computed dependencies correctly", async () => {
			const base = signal(1, { name: "base" });
			const doubled = computed(() => base.value * 2, { name: "doubled" });
			const quadrupled = computed(() => doubled.value * 2, {
				name: "quadrupled",
			});
			quadrupled.subscribe(() => {});

			// Capture updates sent to devtools
			const updates: any[] = [];
			const unsubscribe = window.__PREACT_SIGNALS_DEVTOOLS__.onUpdate(
				newUpdates => {
					updates.push(...newUpdates);
				}
			);

			// Update the base signal
			base.value = 2;

			await new Promise(resolve => setTimeout(resolve, 0));
			unsubscribe();

			// Find the updates
			const doubledUpdate = updates.find(u => u.signalName === "doubled");
			const quadrupledUpdate = updates.find(u => u.signalName === "quadrupled");

			expect(doubledUpdate).toBeDefined();
			expect(doubledUpdate.allDependencies).toBeDefined();
			// doubled depends only on base
			expect(doubledUpdate.allDependencies).toHaveLength(1);

			expect(quadrupledUpdate).toBeDefined();
			expect(quadrupledUpdate.allDependencies).toBeDefined();
			// quadrupled depends only on doubled
			expect(quadrupledUpdate.allDependencies).toHaveLength(1);
		});

		it("should not include allDependencies for plain signals", async () => {
			const count = signal(0, { name: "plainSignal" });
			count.subscribe(() => {});

			// Capture updates sent to devtools
			const updates: any[] = [];
			const unsubscribe = window.__PREACT_SIGNALS_DEVTOOLS__.onUpdate(
				newUpdates => {
					updates.push(...newUpdates);
				}
			);

			// Update the signal
			count.value = 1;

			await new Promise(resolve => setTimeout(resolve, 0));
			unsubscribe();

			// Find the update for the plain signal
			const signalUpdate = updates.find(u => u.signalName === "plainSignal");
			expect(signalUpdate).toBeDefined();
			// Plain signals don't have dependencies, so allDependencies should be undefined
			expect(signalUpdate.allDependencies).toBeUndefined();
		});

		it("should preserve all dependencies even when triggered by just one", async () => {
			// This is the key test for the feature - when a computed depends on
			// multiple signals but only one triggers an update, allDependencies
			// should still include ALL dependencies, not just the triggering one
			const todo1Done = signal(false, { name: "todo-1-done" });
			const todo2Done = signal(true, { name: "todo-2-done" }); // Start true so one toggle flips the result
			const allDone = computed(() => todo1Done.value && todo2Done.value, {
				name: "all-done",
			});
			allDone.subscribe(() => {});

			// Capture updates sent to devtools
			const updates: any[] = [];
			const unsubscribe = window.__PREACT_SIGNALS_DEVTOOLS__.onUpdate(
				newUpdates => {
					updates.push(...newUpdates);
				}
			);

			// Only update todo1Done - but allDependencies should show BOTH
			// This changes allDone from false to true
			todo1Done.value = true;

			await new Promise(resolve => setTimeout(resolve, 0));
			unsubscribe();

			// Find the update for allDone
			const allDoneUpdate = updates.find(u => u.signalName === "all-done");
			expect(allDoneUpdate).toBeDefined();
			expect(allDoneUpdate.allDependencies).toBeDefined();
			// Should have BOTH dependencies, not just the one that triggered
			expect(allDoneUpdate.allDependencies).toHaveLength(2);

			// subscribedTo should only show the triggering signal
			expect(allDoneUpdate.subscribedTo).toBeDefined();
		});
	});
});
