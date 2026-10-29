import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	computed,
	createModel,
	effect,
	signal,
	untracked,
	type ReadonlySignal,
} from "@preact/signals-core";
import { setDebugOptions } from "@preact/signals-debug";

describe("Effect initialization diagnostics", () => {
	let warn: ReturnType<typeof vi.spyOn>;
	let disposers: (() => void)[];

	beforeEach(() => {
		warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		disposers = [];
		setDebugOptions({ enabled: true, consoleLogging: true });
	});

	afterEach(() => {
		for (const dispose of disposers) dispose();
		setDebugOptions({ enabled: true, consoleLogging: true });
		vi.restoreAllMocks();
	});

	it("reports the cold evaluation path without evaluating or subscribing early", () => {
		const watched = vi.fn();
		const source = signal(0, { watched });
		const events: string[] = [];
		const inner = computed(
			() => {
				events.push("inner");
				disposers.push(
					effect(
						() => {
							events.push("effect");
						},
						{ name: "observe" }
					)
				);
				return source.value;
			},
			{ name: "inner" }
		);
		const outer = computed(
			() => {
				events.push("outer");
				return inner.value;
			},
			{ name: "outer" }
		);

		expect(events).toEqual([]);
		expect(warn).not.toHaveBeenCalled();
		expect(outer.value).toBe(0);
		expect(events).toEqual(["outer", "inner", "effect"]);
		expect(warn).toHaveBeenCalledOnce();
		const [message, diagnostic, stack] = warn.mock.calls[0];
		expect(message).toContain(
			"Effect first observed during computed evaluation"
		);
		expect(diagnostic.code).toBe("effect-in-computed");
		expect(diagnostic.executionPath).toEqual([
			expect.objectContaining({
				name: "outer",
				type: "computed",
				id: expect.any(String),
			}),
			expect.objectContaining({
				name: "inner",
				type: "computed",
				id: expect.any(String),
			}),
			expect.objectContaining({
				name: "observe",
				type: "effect",
				id: expect.any(String),
			}),
		]);
		expect(stack).toBeInstanceOf(Error);
		expect(stack.stack).toContain("initialization.test");
		expect(outer.value).toBe(0);
		expect(events).toEqual(["outer", "inner", "effect"]);
		expect(warn).toHaveBeenCalledOnce();
		expect(watched).not.toHaveBeenCalled();
	});

	it("warns when a model starts an effect through untracked", () => {
		const Model = createModel(() => {
			effect(() => {}, { name: "model effect" });
			return { value: signal(1) };
		});
		const model = computed(() => untracked(() => new Model()), {
			name: "model projection",
		});
		const instance = model.value;
		disposers.push(() => instance[Symbol.dispose]());

		expect(warn).toHaveBeenCalledOnce();
		expect(warn.mock.calls[0][1].executionPath).toEqual([
			expect.objectContaining({ name: "model projection" }),
			expect.objectContaining({ name: "model effect" }),
		]);
	});

	it("warns before a circular read while preserving the original error", () => {
		let status: ReadonlySignal<number>;
		const messages = computed(
			() => {
				effect(
					() => {
						void status.value;
					},
					{ name: "observe status" }
				);
				return 1;
			},
			{ name: "messages" }
		);
		status = computed(() => messages.value, { name: "status" });

		expect(() => status.value).toThrow("Cycle detected");
		expect(warn).toHaveBeenCalledOnce();
		expect(warn.mock.calls[0][1].executionPath).toEqual([
			expect.objectContaining({ name: "status" }),
			expect.objectContaining({ name: "messages" }),
			expect.objectContaining({ name: "observe status" }),
		]);
		// A cached error must not replay initialization or leak execution frames.
		expect(() => status.value).toThrow("Cycle detected");
		disposers.push(effect(() => {}));
		expect(warn).toHaveBeenCalledOnce();
	});

	it("warns for initialization on a later invalidation, without warming the computed", () => {
		const enabled = signal(false);
		const value = computed(
			() => {
				if (enabled.value)
					disposers.push(effect(() => {}, { name: "late effect" }));
				return enabled.value;
			},
			{ name: "conditional" }
		);

		expect(value.value).toBe(false);
		enabled.value = true;
		expect(warn).not.toHaveBeenCalled();
		expect(value.value).toBe(true);
		expect(warn).toHaveBeenCalledOnce();
	});

	it("does not warn for ordinary effects reading computeds or debug's logging effects", async () => {
		const source = signal(0);
		const value = computed(() => source.value + 1);
		disposers.push(
			effect(() => {
				void value.value;
			})
		);
		source.value++;
		await Promise.resolve();
		expect(warn).not.toHaveBeenCalled();
	});

	it("includes intervening effects in the execution path", () => {
		const inner = computed(
			() => {
				disposers.push(effect(() => {}, { name: "inner effect" }));
				return 1;
			},
			{ name: "inner" }
		);
		const outer = computed(
			() => {
				disposers.push(
					effect(
						() => {
							void inner.value;
						},
						{ name: "outer effect" }
					)
				);
				return 1;
			},
			{ name: "outer" }
		);

		expect(outer.value).toBe(1);
		expect(warn).toHaveBeenCalledTimes(2);
		expect(warn.mock.calls[1][1].executionPath).toEqual([
			expect.objectContaining({ name: "outer" }),
			expect.objectContaining({ name: "outer effect" }),
			expect.objectContaining({ name: "inner" }),
			expect.objectContaining({ name: "inner effect" }),
		]);
	});

	it("does not mistake an existing effect rerun for initialization", () => {
		const source = signal(0);
		disposers.push(
			effect(
				() => {
					void source.value;
				},
				{ name: "existing" }
			)
		);
		const value = computed(() => {
			source.value = 1;
			return 1;
		});

		expect(value.value).toBe(1);
		expect(warn).not.toHaveBeenCalled();
	});

	it("removes execution frames when callbacks throw", () => {
		const error = new Error("user error");
		const value = computed(() => {
			effect(() => {
				throw error;
			});
		});

		expect(() => value.value).toThrow(error);
		warn.mockClear();
		disposers.push(effect(() => {}));
		expect(warn).not.toHaveBeenCalled();
	});

	it.each([
		{ enabled: false, consoleLogging: true },
		{ enabled: true, consoleLogging: false },
	])("respects debug options %j", options => {
		setDebugOptions(options);
		const value = computed(() => {
			disposers.push(effect(() => {}));
			return 1;
		});
		expect(value.value).toBe(1);
		expect(warn).not.toHaveBeenCalled();
	});

	it("remembers effects first executed while debug was disabled", () => {
		const source = signal(0);
		setDebugOptions({ enabled: false });
		disposers.push(
			effect(() => {
				void source.value;
			})
		);
		setDebugOptions({ enabled: true });
		const value = computed(() => {
			source.value++;
			return 1;
		});

		expect(value.value).toBe(1);
		expect(warn).not.toHaveBeenCalled();
	});

	it("does not recurse indefinitely through a transient cyclic dependency graph", () => {
		const cyclic = signal(false);
		let left: ReadonlySignal<number>;
		const right = computed(() => left.value, { name: "right" });
		left = computed(() => (cyclic.value ? right.value : 1), { name: "left" });

		// Establish right → left before left begins reading right. While core
		// validates right's cached dependencies, both edges temporarily exist.
		expect(right.value).toBe(1);
		cyclic.value = true;
		expect(() => left.value).toThrow("Cycle detected");
		expect(warn).not.toHaveBeenCalled();
	});

	it("does not warn for nested effects outside computed evaluation", () => {
		disposers.push(
			effect(() => {
				disposers.push(effect(() => {}));
			})
		);
		expect(warn).not.toHaveBeenCalled();
	});

	it("warns before peek reenters an evaluating computed", () => {
		const value = computed(
			() => {
				effect(() => {
					void value.peek();
				});
				return 1;
			},
			{ name: "projection" }
		);

		expect(() => value.value).toThrow("Cycle detected");
		expect(warn).toHaveBeenCalledOnce();
	});
});
