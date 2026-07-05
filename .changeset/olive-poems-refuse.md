---
"@preact/signals-core": patch
---

Fix computeds returning stale values after a batch reverts a signal to its original value.

Reconciling a reverted batch write used to roll the signal's version number back, breaking version monotonicity. A lazy computed that read the signal during the batch had already observed the intermediate version, so a later write could re-mint that same version number for a different value and the computed would treat it as unchanged forever. Subscriber nodes that saw the pre-batch version are now fast-forwarded instead, keeping the no-op skip optimization without ever reusing version numbers.
