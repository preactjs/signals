import { describe, it } from "node:test";
import { RuleTester } from "eslint";
import rule from "../src/rules/no-conditional-value-read.mjs";

const tester = new RuleTester({
	languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

describe("no-conditional-value-read", () => {
	it("should pass RuleTester", () => {
		tester.run("no-conditional-value-read", rule, {
			valid: [
				// .value read at top level of effect — always executed
				`import { effect, signal } from "@preact/signals-core";
				 const s = signal(0);
				 effect(() => { console.log(s.value); });`,

				// .value read before any early return
				`import { effect, signal } from "@preact/signals-core";
				 const s = signal(0);
				 effect(() => {
				   const v = s.value;
				   if (!v) return;
				   doSomething(v);
				 });`,

				// .value in if condition — always evaluated
				`import { effect, signal } from "@preact/signals-core";
				 const s = signal(0);
				 effect(() => {
				   if (s.value) { doSomething(); }
				 });`,

				// .value read outside reactive scope — not flagged
				`import { signal } from "@preact/signals-core";
				 const s = signal(0);
				 if (!s.value) doSomething();
				 console.log(s.value);`,

				// .value write (assignment) after early return — OK
				`import { effect, signal } from "@preact/signals-core";
				 const s = signal(0);
				 effect(() => {
				   if (cond) return;
				   s.value = 42;
				 });`,

				// .value update after early return — OK
				`import { effect, signal } from "@preact/signals-core";
				 const s = signal(0);
				 effect(() => {
				   if (cond) return;
				   s.value++;
				 });`,

				// effect from non-signals package
				`import { effect } from "my-lib";
				 import { signal } from "@preact/signals-core";
				 const s = signal(0);
				 effect(() => {
				   if (cond) return;
				   console.log(s.value);
				 });`,

				// Expression-body arrow (always unconditional)
				`import { computed, signal } from "@preact/signals-core";
				 const s = signal(0);
				 const c = computed(() => s.value * 2);`,

				// .value inside a nested function — skipped (can't trace call-site)
				`import { effect, signal } from "@preact/signals-core";
				 const s = signal(0);
				 effect(() => {
				   const fn = () => s.value;
				   fn();
				 });`,

				// if without early return before .value
				`import { effect, signal } from "@preact/signals-core";
				 const s = signal(0);
				 effect(() => {
				   if (cond) { doSomething(); }
				   console.log(s.value);
				 });`,

				// ── Guards that use .value → OK (signal IS tracked) ──

				// .value in if-body guarded by .value condition
				`import { effect, signal } from "@preact/signals-core";
				 const s = signal(0);
				 effect(() => {
				   if (s.value) { console.log(s.value); }
				 });`,

				// .value after early return guarded by .value
				`import { effect, signal } from "@preact/signals-core";
				 const s = signal(0);
				 const s2 = signal("");
				 effect(() => {
				   if (!s.value) return;
				   console.log(s2.value);
				 });`,

				// .value in ternary where test uses .value
				`import { effect, signal } from "@preact/signals-core";
				 const s = signal(0);
				 const s2 = signal(0);
				 effect(() => {
				   const x = s.value ? s2.value : 0;
				 });`,

				// .value after && where left uses .value
				`import { effect, signal } from "@preact/signals-core";
				 const s = signal(0);
				 const s2 = signal(0);
				 effect(() => {
				   const x = s.value && s2.value;
				 });`,

				// .value after || where left uses .value
				`import { effect, signal } from "@preact/signals-core";
				 const s = signal(0);
				 const s2 = signal(0);
				 effect(() => {
				   const x = s.value || s2.value;
				 });`,

				// switch on .value — OK
				`import { effect, signal } from "@preact/signals-core";
				 const s = signal("");
				 effect(() => {
				   switch (s.value) {
				     case "a": doA(); break;
				   }
				 });`,
			],
			invalid: [
				// .value after early return guarded by .peek()
				{
					code: `import { effect, signal } from "@preact/signals-core";
					       const s = signal(0);
					       const s2 = signal(0);
					       effect(() => {
					         const id = s.peek();
					         if (!id) return;
					         console.log(s2.value);
					       });`,
					errors: [{ messageId: "conditionalValueRead" }],
				},
				// .value after early return guarded by non-signal variable
				{
					code: `import { effect, signal } from "@preact/signals-core";
					       const s = signal(0);
					       effect(() => {
					         if (cond) return;
					         console.log(s.value);
					       });`,
					errors: [{ messageId: "conditionalValueRead" }],
				},
				// .value inside if body with non-reactive guard
				{
					code: `import { effect, signal } from "@preact/signals-core";
					       const s = signal(0);
					       effect(() => {
					         if (cond) { console.log(s.value); }
					       });`,
					errors: [{ messageId: "conditionalValueRead" }],
				},
				// .value inside else body with non-reactive guard
				{
					code: `import { effect, signal } from "@preact/signals-core";
					       const s = signal(0);
					       effect(() => {
					         if (cond) {} else { console.log(s.value); }
					       });`,
					errors: [{ messageId: "conditionalValueRead" }],
				},
				// .value after throw with non-reactive guard
				{
					code: `import { effect, signal } from "@preact/signals-core";
					       const s = signal(0);
					       effect(() => {
					         if (cond) throw new Error("bad");
					         console.log(s.value);
					       });`,
					errors: [{ messageId: "conditionalValueRead" }],
				},
				// .value in ternary branch with non-reactive test
				{
					code: `import { effect, signal } from "@preact/signals-core";
					       const s = signal(0);
					       effect(() => {
					         const x = cond ? s.value : 0;
					       });`,
					errors: [{ messageId: "conditionalValueRead" }],
				},
				// .value after short-circuit && with non-reactive left
				{
					code: `import { effect, signal } from "@preact/signals-core";
					       const s = signal(0);
					       effect(() => {
					         const x = cond && s.value;
					       });`,
					errors: [{ messageId: "conditionalValueRead" }],
				},
				// .value after short-circuit || with non-reactive left
				{
					code: `import { effect, signal } from "@preact/signals-core";
					       const s = signal(0);
					       effect(() => {
					         const x = cond || s.value;
					       });`,
					errors: [{ messageId: "conditionalValueRead" }],
				},
				// computed — same pattern
				{
					code: `import { computed, signal } from "@preact/signals-core";
					       const s = signal(0);
					       const c = computed(() => {
					         if (cond) return 0;
					         return s.value * 2;
					       });`,
					errors: [{ messageId: "conditionalValueRead" }],
				},
				// useSignalEffect
				{
					code: `import { useSignalEffect } from "@preact/signals";
					       import { signal } from "@preact/signals-core";
					       const s = signal(0);
					       useSignalEffect(() => {
					         if (cond) return;
					         console.log(s.value);
					       });`,
					errors: [{ messageId: "conditionalValueRead" }],
				},
				// useComputed
				{
					code: `import { useComputed } from "@preact/signals";
					       import { signal } from "@preact/signals-core";
					       const s = signal(0);
					       const c = useComputed(() => {
					         if (cond) return 0;
					         return s.value * 2;
					       });`,
					errors: [{ messageId: "conditionalValueRead" }],
				},
				// .value inside switch case with non-reactive discriminant
				{
					code: `import { effect, signal } from "@preact/signals-core";
					       const s = signal(0);
					       effect(() => {
					         switch (mode) {
					           case "a": console.log(s.value); break;
					         }
					       });`,
					errors: [{ messageId: "conditionalValueRead" }],
				},
				// Multiple .value reads after non-reactive early return
				{
					code: `import { effect, signal } from "@preact/signals-core";
					       const s1 = signal(0);
					       const s2 = signal(0);
					       effect(() => {
					         if (cond) return;
					         console.log(s1.value);
					         console.log(s2.value);
					       });`,
					errors: [
						{ messageId: "conditionalValueRead" },
						{ messageId: "conditionalValueRead" },
					],
				},
				// .value after non-reactive early return + inside non-reactive branch
				{
					code: `import { effect, signal } from "@preact/signals-core";
					       const s1 = signal(0);
					       const s2 = signal(0);
					       effect(() => {
					         if (cond) return;
					         if (other) { console.log(s1.value); }
					         console.log(s2.value);
					       });`,
					errors: [
						{ messageId: "conditionalValueRead" },
						{ messageId: "conditionalValueRead" },
					],
				},
				// aliased import
				{
					code: `import { effect as eff, signal } from "@preact/signals-core";
					       const s = signal(0);
					       eff(() => {
					         if (cond) return;
					         console.log(s.value);
					       });`,
					errors: [{ messageId: "conditionalValueRead" }],
				},
				// .peek() in if-test with early return (the exact issue #621 pattern)
				{
					code: `import { effect, signal } from "@preact/signals-core";
					       const $currentAction = signal({});
					       const $allStates = signal({});
					       effect(() => {
					         const { id } = $currentAction.peek();
					         if (!id) return;
					         const m = $allStates.value[id];
					         console.log(m);
					       });`,
					errors: [{ messageId: "conditionalValueRead" }],
				},
				// untracked() in guard — .value inside untracked is non-reactive
				{
					code: `import { effect, signal, untracked } from "@preact/signals-core";
					       const s = signal(0);
					       const s2 = signal("");
					       effect(() => {
					         if (!untracked(() => s.value)) return;
					         console.log(s2.value);
					       });`,
					errors: [{ messageId: "conditionalValueRead" }],
				},
				// untracked() in ternary test — non-reactive
				{
					code: `import { effect, signal, untracked } from "@preact/signals-core";
					       const s = signal(0);
					       const s2 = signal("");
					       effect(() => {
					         const x = untracked(() => s.value) ? s2.value : "";
					       });`,
					errors: [{ messageId: "conditionalValueRead" }],
				},
				// untracked() in && left — non-reactive
				{
					code: `import { effect, signal, untracked } from "@preact/signals-core";
					       const s = signal(0);
					       const s2 = signal("");
					       effect(() => {
					         const x = untracked(() => s.value) && s2.value;
					       });`,
					errors: [{ messageId: "conditionalValueRead" }],
				},
			],
		});
	});
});
