import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RuleTester } from "eslint";
import rule from "../src/rules/no-signal-in-component-body.mjs";

const tester = new RuleTester({
	languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

describe("no-signal-in-component-body", () => {
	it("should pass RuleTester", () => {
		tester.run("no-signal-in-component-body", rule, {
			valid: [
				// Module-level signal() is fine (not inside a component)
				`import { signal } from "@preact/signals-core";
				 const count = signal(0);`,

				// Hook equivalents are fine in component bodies
				`import { useSignal } from "@preact/signals-react";
				 function MyComponent() {
				   const count = useSignal(0);
				   return null;
				 }`,

				`import { useComputed } from "@preact/signals-react";
				 function MyComponent() {
				   const doubled = useComputed(() => 2);
				   return null;
				 }`,

				`import { useSignalEffect } from "@preact/signals-react";
				 function MyComponent() {
				   useSignalEffect(() => console.log("hi"));
				   return null;
				 }`,

				// Lowercase function is not treated as a component
				`import { signal } from "@preact/signals-core";
				 function createCounter() {
				   return signal(0);
				 }`,

				`import { computed } from "@preact/signals-core";
				 function buildStore() {
				   return computed(() => 42);
				 }`,

				// signal() inside a nested callback inside a component is not flagged
				// (it doesn't run during render)
				`import { signal } from "@preact/signals-core";
				 function MyComponent() {
				   const handleClick = () => {
				     const s = signal(0);
				   };
				   return null;
				 }`,

				`import { signal } from "@preact/signals-core";
				 function MyComponent() {
				   setTimeout(() => {
				     const s = signal(0);
				   }, 0);
				   return null;
				 }`,

				// signal() from a non-signals package should not be flagged
				`import { signal } from "some-other-lib";
				 function MyComponent() {
				   const x = signal(0);
				   return null;
				 }`,

				`import { computed } from "some-other-lib";
				 function MyComponent() {
				   const x = computed(() => 0);
				   return null;
				 }`,

				// Arrow function that is NOT a component (lowercase name)
				`import { signal } from "@preact/signals-core";
				 const makeSignal = () => signal(0);`,
			],

			invalid: [
				// signal() directly in a function component body
				{
					code: `import { signal } from "@preact/signals-core";
					       function MyComponent() {
					         const count = signal(0);
					         return null;
					       }`,
					errors: [
						{
							messageId: "preferHook",
							data: { fn: "signal", hook: "useSignal" },
						},
					],
				},

				// computed() directly in a function component body
				{
					code: `import { computed } from "@preact/signals-core";
					       function MyComponent() {
					         const doubled = computed(() => 2);
					         return null;
					       }`,
					errors: [
						{
							messageId: "preferHook",
							data: { fn: "computed", hook: "useComputed" },
						},
					],
				},

				// effect() directly in a function component body
				{
					code: `import { effect } from "@preact/signals-core";
					       function MyComponent() {
					         effect(() => console.log("hi"));
					         return null;
					       }`,
					errors: [
						{
							messageId: "preferHook",
							data: { fn: "effect", hook: "useSignalEffect" },
						},
					],
				},

				// Arrow function component (uppercase name in variable)
				{
					code: `import { signal } from "@preact/signals-react";
					       const MyComponent = () => {
					         const count = signal(0);
					         return null;
					       };`,
					errors: [
						{
							messageId: "preferHook",
							data: { fn: "signal", hook: "useSignal" },
						},
					],
				},

				// Arrow function component with computed()
				{
					code: `import { computed } from "@preact/signals-react";
					       const MyComponent = () => {
					         const doubled = computed(() => 2);
					         return null;
					       };`,
					errors: [
						{
							messageId: "preferHook",
							data: { fn: "computed", hook: "useComputed" },
						},
					],
				},

				// Aliased import is still caught
				{
					code: `import { signal as s } from "@preact/signals-core";
					       function MyComponent() {
					         const count = s(0);
					         return null;
					       }`,
					errors: [
						{
							messageId: "preferHook",
							data: { fn: "signal", hook: "useSignal" },
						},
					],
				},

				// Multiple violations in one component
				{
					code: `import { signal, computed } from "@preact/signals-core";
					       function MyComponent() {
					         const count = signal(0);
					         const doubled = computed(() => count.value * 2);
					         return null;
					       }`,
					errors: [
						{
							messageId: "preferHook",
							data: { fn: "signal", hook: "useSignal" },
						},
						{
							messageId: "preferHook",
							data: { fn: "computed", hook: "useComputed" },
						},
					],
				},

				// All three raw APIs in one component
				{
					code: `import { signal, computed, effect } from "@preact/signals-core";
					       function MyComponent() {
					         const count = signal(0);
					         const doubled = computed(() => count.value * 2);
					         effect(() => console.log(count.value));
					         return null;
					       }`,
					errors: [
						{ messageId: "preferHook" },
						{ messageId: "preferHook" },
						{ messageId: "preferHook" },
					],
				},

				// From @preact/signals (not just -core)
				{
					code: `import { signal } from "@preact/signals";
					       function MyComponent() {
					         const count = signal(0);
					         return null;
					       }`,
					errors: [
						{
							messageId: "preferHook",
							data: { fn: "signal", hook: "useSignal" },
						},
					],
				},

				// From @preact/signals-react
				{
					code: `import { computed } from "@preact/signals-react";
					       function MyComponent() {
					         const val = computed(() => 42);
					         return null;
					       }`,
					errors: [
						{
							messageId: "preferHook",
							data: { fn: "computed", hook: "useComputed" },
						},
					],
				},

				// Named FunctionExpression (e.g. inside React.memo)
				{
					code: `import { signal } from "@preact/signals-core";
					       const MyComponent = function MyComponent() {
					         const count = signal(0);
					         return null;
					       };`,
					errors: [
						{
							messageId: "preferHook",
							data: { fn: "signal", hook: "useSignal" },
						},
					],
				},

				// export default named function component
				{
					code: `import { signal } from "@preact/signals-core";
					       export default function MyComponent() {
					         const count = signal(0);
					         return null;
					       }`,
					errors: [
						{
							messageId: "preferHook",
							data: { fn: "signal", hook: "useSignal" },
						},
					],
				},
			],
		});
	});
});
