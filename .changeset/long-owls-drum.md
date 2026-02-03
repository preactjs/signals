---
"@preact/signals-debug": patch
---

Avoid calling `console.group` on effects, they can't have descendants
