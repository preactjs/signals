---
"@preact/signals-core": minor
---

Adjust the `ReadOnlySignal` type to not inherit from `Signal`
this way the type can't be widened without noticing, i.e. when
we'd have

```js
const sig: Signal = useComputed(() => x);
```

We would have widened the type to be mutable again, which for
a computed is not allowed. We want to provide the tools to our
users to avoid these footguns hence we are correcting this type
in a minor version.
