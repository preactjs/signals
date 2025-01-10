---
"@preact/signals": patch
---

Change the way we deal with state settling hooks, when we know we are dealing with hooks that can settle their A -> B -> A state (and wind up at the same value). We should not verbatim rerender in our custom shouldComponentUpdate. Instead we should trust that hooks have handled their own state settling.
