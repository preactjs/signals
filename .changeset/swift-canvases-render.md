---
"@preact/signals": patch
---

Fix redundant DOM attribute writes when a parent rerenders with unchanged signal props. The DIFFED hook no longer writes Signal references back into `vnode.props`, which was causing Preact's prop diff to see a mismatch (old: Signal, new: peeked value) and re-apply every signal-bound attribute on every parent rerender.
