import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "../src/rules/no-useless-computed.mjs";

const tester = new RuleTester({
	languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});
const tsTester = new RuleTester({
	languageOptions: {
		ecmaVersion: 2022,
		sourceType: "module",
		parser: tsParser,
	},
});

describe("no-useless-computed", () => {
	it("should pass RuleTester", () => {
		tester.run("no-useless-computed", rule, {
			valid: [
				`import { signal, computed } from "@preact/signals-core";
				 const s = signal(0);
				 const c = computed(() => s.value * 2);`,

				`import { signal, computed } from "@preact/signals-core";
				 const s = signal(0);
				 const c = computed(() => !s.value);`,

				`import { signal, computed } from "@preact/signals-core";
				 const s = signal({ count: 0 });
				 const c = computed(() => s.value.count);`,

				`import { signal, computed } from "@preact/signals-core";
				 const s = signal(0);
				 const c = computed(() => {
				   const value = s.value;
				   return value;
				 });`,

				`import { signal, computed } from "@preact/signals-core";
				 const a = signal(0);
				 const b = signal(1);
				 const c = computed(() => a.value + b.value);`,

				`import { signal, computed } from "@preact/signals-core";
				 const s = signal(0);
				 const c = computed(() => s.peek());`,

				`import { signal, computed } from "@preact/signals-core";
				 const s = signal(0);
				 const c = computed(() => s["value"]);`,

				`import { signal, computed } from "@preact/signals-core";
				 const s = signal(0);
				 const c = computed(async () => s.value);`,

				`import { signal, computed } from "@preact/signals-core";
				 const s = signal(0);
				 const c = computed(() => { return; });`,

				`import { computed } from "@preact/signals-core";
				 const c = computed(() => x.value);`,

				`import { computed } from "totally-unrelated-lib";
				 import { signal } from "@preact/signals-core";
				 const s = signal(0);
				 const c = computed(() => s.value);`,

				`import { signal, computed } from "@preact/signals-core";
				 const s = signal(0);
				 const c = computed(() => (0, s.value));`,

				`import { signal, computed } from "@preact/signals-core";
				 const s = signal(0);
				 const fn = () => s.value;
				 const c = computed(fn);`,

				`import { signal, computed } from "@preact/signals-core";
				 const s = signal(0);
				 const c = computed(() => s);`,

				`import { signal, computed } from "@preact/signals-core";
				 const s = signal(0);
				 const c = computed(() => s.value, { name: "x" });`,

				`import { signal, computed } from "@preact/signals-core";
				 const a = signal(signal(0));
				 const c = computed(() => a.value.value);`,
			],
			invalid: [
				{
					code: `import { signal, computed } from "@preact/signals-core";
					       const s = signal(0);
					       const c = computed(() => s.value);`,
					errors: [{ messageId: "uselessComputed" }],
				},
				{
					code: `import { signal, computed } from "@preact/signals-core";
					       const s = signal(0);
					       const c = computed(() => { return s.value; });`,
					errors: [{ messageId: "uselessComputed" }],
				},
				{
					code: `import { signal, computed } from "@preact/signals-core";
					       const s = signal(0);
					       const c = computed(function () { return s.value; });`,
					errors: [{ messageId: "uselessComputed" }],
				},
				{
					code: `import { useSignal, useComputed } from "@preact/signals";
					       const s = useSignal(0);
					       const c = useComputed(() => s.value);`,
					errors: [{ messageId: "uselessComputed" }],
				},
				{
					code: `import { signal, computed as c } from "@preact/signals-core";
					       const s = signal(0);
					       const value = c(() => s.value);`,
					errors: [{ messageId: "uselessComputed" }],
				},
				{
					code: `import * as core from "@preact/signals-core";
					       const s = core.signal(0);
					       const c = core.computed(() => s.value);`,
					errors: [{ messageId: "uselessComputed" }],
				},
				{
					code: `import { signal, computed } from "@preact/signals-core";
					       const s = signal(0);
					       const c = computed(() => (s.value));`,
					errors: [{ messageId: "uselessComputed" }],
				},
				{
					code: `import { signal, computed } from "@preact/signals-core";
					       const s = signal(0);
					       const c = computed(() => s?.value);`,
					errors: [{ messageId: "uselessComputed" }],
				},
				{
					code: `import { signal, computed } from "@preact/signals-core";
					       const s = signal(0);
					       const a = computed(() => s.value * 2);
					       const b = computed(() => a.value);`,
					errors: [{ messageId: "uselessComputed" }],
				},
			],
		});
	});

	it("should detect typed signals", () => {
		tsTester.run("no-useless-computed-types", rule, {
			valid: [
				`import { computed } from "@preact/signals-core";
				 import type { Signal } from "@preact/signals-core";
				 declare const s: Signal<number>;
				 const c = computed(() => s.value * 2);`,

				`import { computed } from "@preact/signals-core";
				 type NotASignal = { value: number };
				 const s: NotASignal = { value: 0 };
				 const c = computed(() => s.value);`,
			],
			invalid: [
				{
					code: `import { computed } from "@preact/signals-core";
					       import type { Signal } from "@preact/signals-core";
					       const s: Signal<number> = getS();
					       const c = computed(() => s.value);`,
					errors: [{ messageId: "uselessComputed" }],
				},
				{
					code: `import { computed } from "@preact/signals-core";
					       import type { ReadonlySignal } from "@preact/signals-core";
					       const s: ReadonlySignal<number> = getS();
					       const c = computed(() => s.value);`,
					errors: [{ messageId: "uselessComputed" }],
				},
				{
					code: `import { computed } from "@preact/signals-core";
					       import type { Signal } from "@preact/signals-core";
					       function make(s: Signal<number>) {
					         return computed(() => s.value);
					       }`,
					errors: [{ messageId: "uselessComputed" }],
				},
			],
		});
	});
});
