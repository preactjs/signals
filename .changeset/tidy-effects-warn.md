---
"@preact/signals-debug": patch
---

Warn when an effect is first observed during computed evaluation, with named execution ancestry and a stack to help diagnose lazy initialization cycles. Prevent debug dependency traversal from overflowing on transient cycles and masking core's cycle error.
