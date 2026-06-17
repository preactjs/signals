---
"@preact/signals-core": patch
---

Prevent model effect capture while creating effects inside `untracked()` and `action()` callbacks.

If you create an `effect()` inside an `untracked()` callback within a `createModel()` factory, that effect is no longer disposed when the model is disposed. Use the disposer returned by `effect()` to clean it up manually.
