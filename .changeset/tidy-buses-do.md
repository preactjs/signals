---
"@preact/signals-core": minor
"@preact/signals": minor
"@preact/signals-react": minor
---

Add ability to run custom cleanup logic when an effect is disposed.

```js
effect(() => {
  console.log("This runs whenever a dependency changes");
  return () => {
    console.log("This runs when the effect is disposed");
  });
});
```
