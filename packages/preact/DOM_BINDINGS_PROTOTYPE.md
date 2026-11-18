# Experimental DevTools DOM binding metadata

`unstable_startDomBindingTracking()` is an opt-in prototype for in-page tooling.
Enable it before creating/rendering app VNodes; it does not discover bindings
created before enablement and is not a production integration contract.

```ts
import { unstable_startDomBindingTracking } from "@preact/signals";

const source = unstable_startDomBindingTracking();
// Mount the app, then attach tooling now or later:
const off = source.subscribe(() => {
	const { bindings, truncated } = source.getSnapshot(1000);
	// Raw in-page objects: effect, signal, target, kind, property, updates.
});
// Call getSnapshot() immediately for discovery/replay as well.
off();
// Unmount the app before disposing the tracking owner:
source.dispose();
```

One tracking owner may be active at a time; multiple consumers can subscribe to
that source. Dispose is idempotent and releases registry references. No reactive
subscriptions or computed evaluations are introduced by the metadata observer.
Only active bindings are stored; snapshots are capped at 10,000 entries.
Notifications are coalesced microtask invalidations, not a lossless event log.
An already pending invalidation may reach a new subscriber.

Signal children expose the original signal rather than their getter facade.
Text-to-text and property writes increment actual-write counters without
claiming a component render. Text/JSX transitions and prop rebinding update the
registry; removal/unmount cleans up records. Runtime values are never serialized
by this hook. Signal/effect identity can reuse the existing signals debug layer.

The source intentionally exposes raw DOM/effect/signal references **in-page**.
Consumers must serialize bounded metadata rather than transporting these objects.
General signal updates/dependencies remain the responsibility of existing debug
hooks; this prototype only supplies the missing DOM-binding associations.
