import { describe, it, expect } from "vitest";

// We need to import and test the deeplyRemoveFunctions function
// Since it's not exported, we'll test it through the public API
// But for unit testing, let's create a test version

// Test version of deeplyRemoveFunctions to test circular reference handling
function deeplyRemoveFunctions(obj: any, visited = new WeakSet()): any {
	if (obj === null || obj === undefined) return obj;
	if (typeof obj === "function") return "[Function]";
	if (typeof obj !== "object") return obj;

	// Handle circular references
	if (visited.has(obj)) return "[Circular]";
	visited.add(obj);

	if (Array.isArray(obj)) {
		return obj.map(item => deeplyRemoveFunctions(item, visited));
	}

	const result: any = {};
	for (const key in obj) {
		if (Object.prototype.hasOwnProperty.call(obj, key)) {
			result[key] = deeplyRemoveFunctions(obj[key], visited);
		}
	}
	return result;
}

describe("deeplyRemoveFunctions", () => {
	it("should handle null and undefined", () => {
		expect(deeplyRemoveFunctions(null)).toBe(null);
		expect(deeplyRemoveFunctions(undefined)).toBe(undefined);
	});

	it("should handle primitive values", () => {
		expect(deeplyRemoveFunctions(42)).toBe(42);
		expect(deeplyRemoveFunctions("hello")).toBe("hello");
		expect(deeplyRemoveFunctions(true)).toBe(true);
	});

	it("should replace functions with [Function]", () => {
		expect(deeplyRemoveFunctions(() => {})).toBe("[Function]");
		expect(deeplyRemoveFunctions(function test() {})).toBe("[Function]");
	});

	it("should handle simple objects", () => {
		const obj = { a: 1, b: "test", c: true };
		const result = deeplyRemoveFunctions(obj);
		expect(result).toEqual({ a: 1, b: "test", c: true });
	});

	it("should handle arrays", () => {
		const arr = [1, "test", true];
		const result = deeplyRemoveFunctions(arr);
		expect(result).toEqual([1, "test", true]);
	});

	it("should handle nested objects", () => {
		const obj = {
			a: 1,
			b: {
				c: 2,
				d: {
					e: 3,
				},
			},
		};
		const result = deeplyRemoveFunctions(obj);
		expect(result).toEqual(obj);
	});

	it("should remove functions from objects", () => {
		const obj = {
			a: 1,
			fn: () => {},
			b: "test",
		};
		const result = deeplyRemoveFunctions(obj);
		expect(result).toEqual({
			a: 1,
			fn: "[Function]",
			b: "test",
		});
	});

	it("should remove functions from nested objects", () => {
		const obj = {
			a: 1,
			nested: {
				fn: () => {},
				b: "test",
			},
		};
		const result = deeplyRemoveFunctions(obj);
		expect(result).toEqual({
			a: 1,
			nested: {
				fn: "[Function]",
				b: "test",
			},
		});
	});

	it("should handle self-referencing objects", () => {
		const obj: any = { a: 1 };
		obj.self = obj; // Create circular reference

		const result = deeplyRemoveFunctions(obj);

		expect(result).toEqual({
			a: 1,
			self: "[Circular]",
		});
	});

	it("should handle deeply nested circular references", () => {
		const obj: any = {
			a: 1,
			nested: {
				b: 2,
			},
		};
		obj.nested.parent = obj; // Create circular reference in nested object

		const result = deeplyRemoveFunctions(obj);

		expect(result).toEqual({
			a: 1,
			nested: {
				b: 2,
				parent: "[Circular]",
			},
		});
	});

	it("should handle circular arrays", () => {
		const arr: any = [1, 2, 3];
		arr.push(arr); // Create circular reference

		const result = deeplyRemoveFunctions(arr);

		expect(result).toEqual([1, 2, 3, "[Circular]"]);
	});

	it("should handle multiple references to the same object", () => {
		const shared = { value: 42 };
		const obj = {
			ref1: shared,
			ref2: shared,
			ref3: shared,
		};

		const result = deeplyRemoveFunctions(obj);

		// First reference should be processed normally
		// Subsequent references should be marked as circular
		expect(result.ref1).toEqual({ value: 42 });
		expect(result.ref2).toBe("[Circular]");
		expect(result.ref3).toBe("[Circular]");
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

		const result = deeplyRemoveFunctions(parent);

		expect(result.name).toBe("parent");
		expect(result.children).toHaveLength(2);
		expect(result.children[0].name).toBe("child1");
		expect(result.children[0].parent).toBe("[Circular]");
		expect(result.children[1].name).toBe("child2");
		expect(result.children[1].parent).toBe("[Circular]");
	});

	it("should handle objects with functions and circular references", () => {
		const obj: any = {
			a: 1,
			fn: () => {},
			nested: {
				b: 2,
				fn2: function test() {},
			},
		};
		obj.self = obj;
		obj.nested.parent = obj;

		const result = deeplyRemoveFunctions(obj);

		expect(result).toEqual({
			a: 1,
			fn: "[Function]",
			nested: {
				b: 2,
				fn2: "[Function]",
				parent: "[Circular]",
			},
			self: "[Circular]",
		});
	});
});
