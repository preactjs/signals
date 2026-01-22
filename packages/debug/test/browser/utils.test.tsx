import { describe, it, expect } from "vitest";
import { formatValue, getSignalName } from "../../src/utils";
import { signal, computed } from "@preact/signals-core";

describe("formatValue", () => {
	it("should handle null and undefined", () => {
		expect(formatValue(null)).toBe("null");
		expect(formatValue(undefined)).toBe("undefined");
	});

	it("should handle primitive values", () => {
		expect(formatValue(42)).toBe("42");
		expect(formatValue("hello")).toBe("hello");
		expect(formatValue(true)).toBe("true");
		expect(formatValue(false)).toBe("false");
	});

	it("should stringify simple objects", () => {
		expect(formatValue({ a: 1, b: 2 })).toBe('{"a":1,"b":2}');
	});

	it("should stringify arrays", () => {
		expect(formatValue([1, 2, 3])).toBe("[1,2,3]");
	});

	it("should handle nested objects", () => {
		const obj = { a: 1, nested: { b: 2, c: 3 } };
		expect(formatValue(obj)).toBe('{"a":1,"nested":{"b":2,"c":3}}');
	});

	it("should handle self-referencing objects", () => {
		const obj: any = { a: 1 };
		obj.self = obj;

		const result = formatValue(obj);
		expect(result).toBe('{"a":1,"self":"[Circular]"}');
	});

	it("should handle deeply nested circular references", () => {
		const obj: any = {
			a: 1,
			nested: {
				b: 2,
			},
		};
		obj.nested.parent = obj;

		const result = formatValue(obj);
		expect(result).toBe('{"a":1,"nested":{"b":2,"parent":"[Circular]"}}');
	});

	it("should handle circular arrays", () => {
		const arr: any = [1, 2, 3];
		arr.push(arr);

		const result = formatValue(arr);
		expect(result).toBe('[1,2,3,"[Circular]"]');
	});

	it("should handle multiple references to the same object", () => {
		const shared = { value: 42 };
		const obj = {
			ref1: shared,
			ref2: shared,
		};

		const result = formatValue(obj);
		// First reference should be processed normally, second marked as circular
		expect(result).toBe('{"ref1":{"value":42},"ref2":"[Circular]"}');
	});

	it("should handle complex circular structures", () => {
		const parent: any = {
			name: "parent",
			children: [],
		};
		const child1: any = {
			name: "child1",
			parent: parent,
		};
		const child2: any = {
			name: "child2",
			parent: parent,
		};
		parent.children.push(child1, child2);

		const result = formatValue(parent);
		expect(result).toContain('"name":"parent"');
		expect(result).toContain('"name":"child1"');
		expect(result).toContain('"name":"child2"');
		expect(result).toContain('"[Circular]"');
	});

	it("should return (unstringifiable value) for objects with toJSON that throws", () => {
		const obj = {
			toJSON() {
				throw new Error("Cannot stringify");
			},
		};

		const result = formatValue(obj);
		expect(result).toBe("(unstringifiable value)");
	});
});

describe("getSignalName", () => {
	it("should return signal name if present", () => {
		const sig = signal(0, { name: "counter" });
		expect(getSignalName(sig, false)).toBe("counter");
	});

	it("should return (anonymous signal) for unnamed signals", () => {
		const sig = signal(0);
		expect(getSignalName(sig, false)).toBe("(anonymous signal)");
	});

	it("should return computed name if present", () => {
		const sig = signal(1);
		const comp = computed(() => sig.value * 2, { name: "doubled" });
		// @ts-expect-error
		expect(getSignalName(comp)).toBe("doubled");
	});

	it("should return (anonymous signal) for unnamed computed", () => {
		const sig = signal(1);
		const comp = computed(() => sig.value * 2);
		// @ts-expect-error
		expect(getSignalName(comp)).toBe("(anonymous signal)");
	});
});
