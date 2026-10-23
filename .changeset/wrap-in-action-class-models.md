---
"@preact/signals-core": patch
---

Fix `createModel` to also wrap class prototype methods as actions. When a factory returns a class instance, every method on its prototype chain (including `toString` or `toJSON`) becomes a batched, untracked action on the instance, so a getter-style method called inside a `computed` no longer subscribes to the signals it reads. These actions are not auto-bound, so call them as methods rather than passing them around detached.
