---
"@preact/signals": patch
---

Don't re-run a `useSignalEffect` for a component that was unmounted by the same update. Preact 11 disposes it after paint, so the effect could otherwise run once more against an unmounted component.
