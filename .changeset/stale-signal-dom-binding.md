---
"@preact/signals": patch
---

Fix Signal-bound DOM props getting stranded at a stale value when Preact reuses a DOM node. The prop-binding effect now writes the applied value back into the rendered props, keeping Preact's diff baseline in sync with the DOM instead of assuming Preact applied every update.
