---
"@preact/signals-core": patch
---

Adjust ReadOnlySignal to not inherit from `Signal`
so the type can't be widened
