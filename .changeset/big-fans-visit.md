---
"@preact/signals-core": minor
---

Prevent batches where a signal goes from A --> B --> A from triggering dependent updates, a computed/effect should not re-run when the dependencies in a batched update amount to an equal value.
