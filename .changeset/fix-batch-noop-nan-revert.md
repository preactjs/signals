---
"@preact/signals-core": patch
---

Fix a no-op `batch` assignment that reverts a signal back to `NaN` incorrectly re-running effects. The batch snapshot reconciliation compared the final value to the pre-batch value with `===`, which is always `false` for `NaN`, so the version was never rolled back. Reverting a `NaN` value to `NaN` within a batch is now correctly treated as unchanged.
