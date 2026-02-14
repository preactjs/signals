import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "../src/rules/no-value-after-await.mjs";

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

describe("no-value-after-await", () => {
	it("should pass RuleTester", () => {
		tester.run("no-value-after-await", rule, {
			valid: [
				// Reading .value before await is fine
				`async function run() {
				   const v = sig.value;
				   const data = await fetch("/api");
				 }`,

				// Reading .value in a sync function is always fine
				`function run() {
				   const v = sig.value;
				 }`,

				// Reading .value in a non-async arrow is fine
				`const run = () => { return sig.value; };`,

				// Reading .value in a nested sync function inside async is fine
				`async function run() {
				   await fetch("/api");
				   const fn = () => sig.value;
				 }`,

				// No .value access at all
				`async function run() {
				   await fetch("/api");
				   console.log("done");
				 }`,

				// Reading .value on a non-signal variable (e.g. DOM input)
				`async function run() {
				   const el = document.querySelector("input");
				   await fetch("/api");
				   console.log(el.value);
				 }`,

				// Writing .value after await is fine (mutations don't need tracking)
				`async function run() {
				   await fetch("/api");
				   sig.value = 42;
				 }`,

				// Compound assignment after await is fine
				`async function run() {
				   await fetch("/api");
				   total.value += 10;
				 }`,

				// Multiple writes after await
				`async function run() {
				   await sleep(100);
				   running.value = true;
				   results[i].value = result;
				   running.value = false;
				 }`,

				// Increment/decrement after await
				`async function run() {
				   await fetch("/api");
				   counter.value++;
				 }`,
			],
			invalid: [
				{
					code: `async function run() {
					         await fetch("/api");
					         console.log(sig.value);
					       }`,
					errors: [{ messageId: "valueAfterAwait" }],
				},
				{
					code: `const run = async () => {
					         await fetch("/api");
					         return sig.value;
					       };`,
					errors: [{ messageId: "valueAfterAwait" }],
				},
				{
					code: `async function run() {
					         await fetch("/api");
					         const a = sig1.value;
					         const b = sig2.value;
					       }`,
					errors: [
						{ messageId: "valueAfterAwait" },
						{ messageId: "valueAfterAwait" },
					],
				},
				{
					code: `import { effect } from "@preact/signals-core";
					       effect(async () => {
					         await somePromise;
					         console.log(name.value);
					       });`,
					errors: [{ messageId: "valueAfterAwait" }],
				},
			],
		});
	});

	it("should detect signals via type annotations", () => {
		tsTester.run("no-value-after-await-types", rule, {
			valid: [
				// Typed signal read BEFORE await is fine
				`import type { Signal } from "@preact/signals-core";
				 async function run(s: Signal<number>) {
				   const v = s.value;
				   await fetch("/api");
				 }`,
			],
			invalid: [
				// Signal-typed parameter, .value after await
				{
					code: `import type { Signal } from "@preact/signals-core";
					       async function run(s: Signal<number>) {
					         await fetch("/api");
					         return s.value;
					       }`,
					errors: [{ messageId: "valueAfterAwait" }],
				},
			],
		});
	});
});
