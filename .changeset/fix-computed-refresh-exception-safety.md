---
"@preact/signals-core": patch
---

Keep the graph usable when an exception escapes a computed refresh, an effect run's cleanup or a batch flush (for example a throwing `unwatched` callback or an engine error such as a stack overflow). Later reads no longer throw "Cycle detected" and effects keep running.
