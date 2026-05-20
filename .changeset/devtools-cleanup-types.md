---
"@preact/signals-debug": patch
"@preact/signals-devtools-adapter": patch
"@preact/signals-devtools-ui": patch
---

Clean up DevTools integration types and configuration payload handling. The debug package now sends normalized settings payloads, adapters accept current and legacy config/availability messages, and the UI disposes adapter subscriptions when contexts are destroyed.
