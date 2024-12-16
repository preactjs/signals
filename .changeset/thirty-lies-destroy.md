---
"@preact/signals-react-transform": patch
---

Avoid cloning the top-level component function when we are
prepending `useSignals`. This fixes compatability with fast-refresh
as it requires the function identity to correctly leverage its
cache.
