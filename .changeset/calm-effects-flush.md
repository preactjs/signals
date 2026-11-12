---
"@preact/signals": patch
---

Don't subscribe a rendering component to signals read by hook effects that Preact flushes during its render.
