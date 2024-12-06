---
"@preact/signals": patch
---

Change timing to a double microtask so we are behind the Preact render queue but can't delay as much as a user-input coming in.
