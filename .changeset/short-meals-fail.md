---
"@preact/signals-core": minor
---

feat: support disposing `effect()` with resource management

This allows `effect()`'s to be disposed with the new `using` keyword from [the explicit resource management proposal](https://github.com/tc39/proposal-explicit-resource-management).

Whenever an effect goes out of scope the `Symbol.dispose` function is called automatically.

```js
const count = signal(0);

function doSomething() {
	// The `using` keyword calls dispose at the end of
	// this function scope
	using _ = effect(() => {
		console.log(count.value);
		return () => console.log("disposed");
	});

	console.log("hey");
}

doSomething();
// Logs:
//  0
//  hey
//  disposed
```
