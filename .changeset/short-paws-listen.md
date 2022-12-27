---
"@preact/signals": patch
"@preact/signals-react": patch
---

Fix a bug that caused cleanup functions returned from a `useSignalEffect()` callback not to be called.
