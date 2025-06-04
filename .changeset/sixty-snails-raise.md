---
"@preact/signals-react-transform": patch
---

Destructured access to signal values should be registered as usage, before this change Babel would skip a component that would access `.value` on a signal through destructuring
