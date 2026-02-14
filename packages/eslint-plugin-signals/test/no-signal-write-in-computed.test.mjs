import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RuleTester } from "eslint";
import rule from "../src/rules/no-signal-write-in-computed.mjs";

const tester = new RuleTester({
	languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

describe("no-signal-write-in-computed", () => {
	it("should pass RuleTester", () => {
		tester.run("no-signal-write-in-computed", rule, {
			valid: [
				// Writes inside effect are fine
				`import { signal, effect } from "@preact/signals-core";
				 const s = signal(0);
				 effect(() => { s.value = 1; });`,

				// Writes outside computed are fine
				`import { signal, computed } from "@preact/signals-core";
				 const s = signal(0);
				 const c = computed(() => s.value * 2);
				 s.value = 5;`,

				// Reading .value inside computed is fine
				`import { signal, computed } from "@preact/signals-core";
				 const a = signal(1);
				 const b = computed(() => a.value * 2);`,

				// Non-.value property assignments inside computed are fine
				`import { computed } from "@preact/signals-core";
				 const obj = { count: 0 };
				 const c = computed(() => { obj.count = 1; return obj.count; });`,

				// Nested function in computed that isn't the callback
				`import { signal, computed } from "@preact/signals-core";
				 const s = signal(0);
				 function helper() { s.value = 1; }
				 const c = computed(() => s.value);`,

				// A function called "computed" from a non-signals package should be ignored
				`import { computed } from "some-other-lib";
				 const s = { value: 0 };
				 const c = computed(() => { s.value = 1; return s.value; });`,

				// Namespace import from non-signals package should be ignored
				`import * as utils from "some-other-lib";
				 const s = { value: 0 };
				 const c = utils.computed(() => { s.value = 1; return s.value; });`,
			],
			invalid: [
				// Direct write in computed arrow (signals-core)
				{
					code: `import { signal, computed } from "@preact/signals-core";
					        const a = signal(0);
					        const b = signal(0);
					        const c = computed(() => { b.value = a.value * 2; return a.value; });`,
					errors: [{ messageId: "noWriteInComputed" }],
				},
				// Direct write in useComputed arrow (@preact/signals)
				{
					code: `import { useComputed, signal } from "@preact/signals";
					        const a = signal(0);
					        const b = signal(0);
					        const c = useComputed(() => { b.value = a.value; return a.value; });`,
					errors: [{ messageId: "noWriteInComputed" }],
				},
				// Write in computed function expression
				{
					code: `import { signal, computed } from "@preact/signals-core";
					        const a = signal(0);
					        const b = signal(0);
					        const c = computed(function() { b.value = 1; return a.value; });`,
					errors: [{ messageId: "noWriteInComputed" }],
				},
				// Multiple writes
				{
					code: `import { signal, computed } from "@preact/signals-core";
					        const a = signal(0);
					        const b = signal(0);
					        const d = signal(0);
					        const c = computed(() => {
					          b.value = 1;
					          d.value = 2;
					          return a.value;
					        });`,
					errors: [
						{ messageId: "noWriteInComputed" },
						{ messageId: "noWriteInComputed" },
					],
				},
				// Aliased import: import { computed as memo } — still caught
				{
					code: `import { signal, computed as memo } from "@preact/signals-core";
					        const a = signal(0);
					        const b = signal(0);
					        const c = memo(() => { b.value = 1; return a.value; });`,
					errors: [{ messageId: "noWriteInComputed" }],
				},
				// @preact/signals-react
				{
					code: `import { useComputed } from "@preact/signals-react";
					        const b = { value: 0 };
					        const c = useComputed(() => { b.value = 1; return 42; });`,
					errors: [{ messageId: "noWriteInComputed" }],
				},
				// Increment (UpdateExpression: sig.value++)
				{
					code: `import { signal, computed } from "@preact/signals-core";
					        const s = signal(0);
					        const c = computed(() => { s.value++; return s.value; });`,
					errors: [{ messageId: "noWriteInComputed" }],
				},
				// Decrement (UpdateExpression: --sig.value)
				{
					code: `import { signal, computed } from "@preact/signals-core";
					        const s = signal(0);
					        const c = computed(() => { --s.value; return s.value; });`,
					errors: [{ messageId: "noWriteInComputed" }],
				},
				// Compound assignment (sig.value += 1)
				{
					code: `import { signal, computed } from "@preact/signals-core";
					        const s = signal(0);
					        const c = computed(() => { s.value += 1; return s.value; });`,
					errors: [{ messageId: "noWriteInComputed" }],
				},
				// Namespace import from signals package — still caught
				{
					code: `import * as core from "@preact/signals-core";
					        const s = core.signal(0);
					        const c = core.computed(() => { s.value = 1; return s.value; });`,
					errors: [{ messageId: "noWriteInComputed" }],
				},
			],
		});
	});
});
