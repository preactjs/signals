---
"@preact/signals": minor
---

Defer all DOM updates by an animation frame, this should make it so
that any previously synchronous DOM update will be instead delayed by an
animation frame. This allows Preact to first perform its own render
cycle and then our direct DOM updates to occur. These will now
be performed in a batched way which is more performant as the browser
is prepared to handle these during the animation frame.

This does impact how Preact based signals are tested, when
you perform a signal update, you'll need to wrap it in `act`. In a way
this was always the case, as a signal update that resulted in
a Preact state update would require it to be wrapped in `act`, but
now this is the norm.
