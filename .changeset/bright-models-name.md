---
"@preact/signals-preact-transform": minor
---

Add debug name injection for `createModel` and `action` calls

The babel transform now automatically injects debug names for `createModel` and `action` calls, similar to the existing support for `signal` and `computed`:

```js
// Input
const CounterModel = createModel(() => ({
	count: signal(0),
	doubled: computed(() => count.value * 2),
}));

// Output
const CounterModel = createModel(
	() => ({
		count: signal(0, { name: "CounterModel.count (file.js:2)" }),
		doubled: computed(() => count.value * 2, {
			name: "CounterModel.doubled (file.js:3)",
		}),
	}),
	{ name: "CounterModel (file.js:1)" }
);
```

Key features:

- Signals and computed values inside `createModel` are prefixed with the model name (e.g., `CounterModel.count`)
- Works with both object return syntax and block body with variable declarations
- Standalone `action` calls also get debug names injected
- Names include file location for easier debugging
