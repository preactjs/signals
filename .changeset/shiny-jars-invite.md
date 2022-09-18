---
"@preact/signals-core": patch
"@preact/signals": patch
"@preact/signals-react": patch
---

Remove all usages of `Set`, `Map` and other allocation heavy objects in signals-core. This substaintially increases performance across all measurements.
