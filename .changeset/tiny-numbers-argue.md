---
"@preact/signals-core": patch
---

Fix invalidated signals inside `batch()` not being refreshed when read inside a batching operation. This fixes a regression.
