---
"@preact/signals": patch
---

Flush pending `useSignalEffect` re-runs after every commit instead of waiting for the next animation frame. Previously, a state update scheduled between a signal write and the animation frame would render before the pending effect ran, so that render could observe state from before the effect. Draining the effect queue in Preact's commit hook keeps the documented after-commit timing for the effect's own render while ensuring later renders never start with stale pending effects.
