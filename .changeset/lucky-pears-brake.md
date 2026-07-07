---
"@preact/signals": patch
---

Stop treating `useContext` as hook state in the auto-memoization heuristic. Context updates force-update their subscribers in Preact, bypassing `shouldComponentUpdate` entirely, so context consumers can safely keep the props-based render skipping.
