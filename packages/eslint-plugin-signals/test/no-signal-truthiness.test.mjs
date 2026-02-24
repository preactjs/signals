import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "../src/rules/no-signal-truthiness.mjs";

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

describe("no-signal-truthiness", () => {
	it("should pass RuleTester", () => {
		tester.run("no-signal-truthiness", rule, {
			valid: [
				// Checking .value is fine
				`import { signal } from "@preact/signals-core";
				 const count = signal(0);
				 if (count.value) {}`,

				// Non-signal identifiers
				`const x = 5;
				 if (x) {}`,

				// Signal as function argument (not boolean context)
				`import { signal } from "@preact/signals-core";
				 const count = signal(0);
				 doSomething(count);`,

				// Ternary on .value
				`import { signal } from "@preact/signals-core";
				 const count = signal(0);
				 const x = count.value ? "a" : "b";`,

				// Unknown variable (not tracked as signal)
				`if (unknownVar) {}`,

				// signal() from a non-signals package should NOT be flagged
				`import { signal } from "totally-unrelated-lib";
				 const count = signal(0);
				 if (count) {}`,
			],
			invalid: [
				{
					code: `import { signal } from "@preact/signals-core";
					       const count = signal(0);
					       if (count) {}`,
					errors: [{ messageId: "noSignalTruthiness" }],
				},
				{
					code: `import { signal } from "@preact/signals-core";
					       const count = signal(0);
					       const x = count ? "yes" : "no";`,
					errors: [{ messageId: "noSignalTruthiness" }],
				},
				{
					code: `import { signal } from "@preact/signals-core";
					       const count = signal(0);
					       const x = count && "truthy";`,
					errors: [{ messageId: "noSignalTruthiness" }],
				},
				{
					code: `import { signal } from "@preact/signals-core";
					       const count = signal(0);
					       const x = !count;`,
					errors: [{ messageId: "noSignalTruthiness" }],
				},
				{
					code: `import { signal } from "@preact/signals-core";
					       const count = signal(0);
					       while (count) { break; }`,
					errors: [{ messageId: "noSignalTruthiness" }],
				},
				{
					code: `import { signal } from "@preact/signals-core";
					       const count = signal(0);
					       const x = Boolean(count);`,
					errors: [{ messageId: "noSignalTruthiness" }],
				},
				{
					code: `import { useSignal } from "@preact/signals";
					       const count = useSignal(0);
					       if (count) {}`,
					errors: [{ messageId: "noSignalTruthiness" }],
				},
				{
					code: `import { computed, signal } from "@preact/signals-core";
					       const s = signal(0);
					       const c = computed(() => s.value * 2);
					       if (c) {}`,
					errors: [{ messageId: "noSignalTruthiness" }],
				},
				{
					code: `import { useComputed } from "@preact/signals-react";
					       const c = useComputed(() => 42);
					       const x = c ? "a" : "b";`,
					errors: [{ messageId: "noSignalTruthiness" }],
				},
				{
					code: `import { signal as s } from "@preact/signals-core";
					       const count = s(0);
					       if (count) {}`,
					errors: [{ messageId: "noSignalTruthiness" }],
				},
				// Signal on right side of && chain
				{
					code: `import { signal } from "@preact/signals-core";
					       const count = signal(0);
					       const x = something && count;`,
					errors: [{ messageId: "noSignalTruthiness" }],
				},
				// Signal on right side of || chain
				{
					code: `import { signal } from "@preact/signals-core";
					       const count = signal(0);
					       const x = fallback || count;`,
					errors: [{ messageId: "noSignalTruthiness" }],
				},
				// Signal in middle of chain — both left and right flagged
				{
					code: `import { signal } from "@preact/signals-core";
					       const a = signal(0);
					       const b = signal(1);
					       const x = a && b;`,
					errors: [
						{ messageId: "noSignalTruthiness" },
						{ messageId: "noSignalTruthiness" },
					],
				},
				// Signal on right of ?? (nullish coalescing)
				{
					code: `import { signal } from "@preact/signals-core";
					       const count = signal(0);
					       const x = fallback ?? count;`,
					errors: [{ messageId: "noSignalTruthiness" }],
				},
			],
		});
	});

	it("should detect signals via type annotations", () => {
		tsTester.run("no-signal-truthiness-types", rule, {
			valid: [
				// Non-signal typed variable
				`const count: number = 5;
				 if (count) {}`,

				// Checking .value on a typed signal is fine
				`import type { Signal } from "@preact/signals-core";
				 declare const count: Signal<number>;
				 if (count.value) {}`,
			],
			invalid: [
				// Variable with Signal type annotation
				{
					code: `import type { Signal } from "@preact/signals-core";
					       const count: Signal<number> = getCount();
					       if (count) {}`,
					errors: [{ messageId: "noSignalTruthiness" }],
				},
				// Variable with ReadonlySignal type annotation
				{
					code: `import type { ReadonlySignal } from "@preact/signals-core";
					       const count: ReadonlySignal<number> = getCount();
					       if (count) {}`,
					errors: [{ messageId: "noSignalTruthiness" }],
				},
				// Function parameter typed as Signal
				{
					code: `import type { Signal } from "@preact/signals-core";
					       function check(s: Signal<number>) { if (s) {} }`,
					errors: [{ messageId: "noSignalTruthiness" }],
				},
			],
		});
	});
});
