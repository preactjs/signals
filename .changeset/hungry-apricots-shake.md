---
"@preact/signals-core": minor
---

Add `createModel` and `action` to signals core package

**`createModel`** provides a structured way to create reactive model classes that encapsulate signals, computed values, and actions:

```js
const CounterModel = createModel((initialCount = 0) => {
	const count = signal(initialCount);
	const doubled = computed(() => count.value * 2);

	effect(() => {
		console.log("Count changed:", count.value);
	});

	return {
		count,
		doubled,
		increment() {
			count.value++;
		},
	};
});

const counter = new CounterModel(5);
counter.increment(); // Updates are automatically batched
counter[Symbol.dispose](); // Cleans up all effects
```

Key features:

- Factory functions can accept arguments for initialization
- All methods are automatically wrapped as actions (batched & untracked)
- Effects created during model construction are captured and disposed when the model is disposed via `Symbol.dispose`
- Models implement the `Disposable` interface for use with `using` declarations
- TypeScript validates that models only contain signals, actions, or nested objects with signals/actions

**`action`** is a helper that wraps a function to run batched and untracked:

```js
const updateAll = action(items => {
	items.forEach(item => item.value++);
}); // All updates batched into single notification
```
