---
"@preact/signals-core": patch
---

Use the same tracking logic for both effects and computeds. This ensures that effects are only called whenever any of their dependencies changes. If they all stay the same, then the effect will not be invoked.
