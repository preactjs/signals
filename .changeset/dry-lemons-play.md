---
"@preact/signals": patch
---

We reduce the raf timeout to be just above a timeout that is associated with a 30hz refresh rate. This ensures that for hidden frames the timeout drift can't be too large, the drift being too high could lead to unexpected situations.
