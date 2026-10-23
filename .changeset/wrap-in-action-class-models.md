---
"@preact/signals-core": patch
---

Fix `createModel` to also wrap class prototype methods as actions. This includes `toString`/`toJSON`, and the actions are not auto-bound.
