---
"@preact/signals": patch
---

Stop component tracking before Preact reconciles the returned VNode so Signals read by DOM property getters do not subscribe the parent component.
