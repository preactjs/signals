---
"@preact/signals-core": patch
---

Reduce batch overhead by reusing snapshot storage, skipping snapshots for unobserved signals, and tracking lazy computed dependencies for the duration of a batch.
