# @preact/signals-core

## 1.1.1

### Patch Changes

- [#143](https://github.com/preactjs/signals/pull/143) [`f2ba3d6`](https://github.com/preactjs/signals/commit/f2ba3d657bf8169c6ba1d47c0827aa18cfe1c947) Thanks [@Pauan](https://github.com/Pauan)! - Simplify `batch()` to use a single flag instead of a counter

* [#150](https://github.com/preactjs/signals/pull/150) [`160ea77`](https://github.com/preactjs/signals/commit/160ea7791f3adb55c562f5990e0b4848d8491a38) Thanks [@marvinhagemeister](https://github.com/marvinhagemeister)! - Fix computed signal being re-calculated despite dependencies not having changed

- [#137](https://github.com/preactjs/signals/pull/137) [`4385ea8`](https://github.com/preactjs/signals/commit/4385ea8c8358a154d8b789685bb061658ce1153f) Thanks [@jviide](https://github.com/jviide)! - Fix `.subscribe`'s TypeScript type

* [#148](https://github.com/preactjs/signals/pull/148) [`b948745`](https://github.com/preactjs/signals/commit/b948745de7b5b60a20ce3bdc5ee72d47d47f38ec) Thanks [@marvinhagemeister](https://github.com/marvinhagemeister)! - Move `types` field in `package.json` to the top of the entry list to ensure that TypeScript always finds it.

- [#149](https://github.com/preactjs/signals/pull/149) [`00a59c6`](https://github.com/preactjs/signals/commit/00a59c6475bd4542fb934474d82d1e242b2ac870) Thanks [@marvinhagemeister](https://github.com/marvinhagemeister)! - Fix invalidated signals inside `batch()` not being refreshed when read inside a batching operation. This fixes a regression.

## 1.1.0

### Minor Changes

- bc0080c: Add `.subscribe()`-method to signals to add support for natively using signals with Svelte

### Patch Changes

- 336bb34: Don't mangle `Signal` class name
- 7228418: Fix incorrectly named variables and address typos in code comments.
- 32abe07: Fix internal API functions being able to unmark non-invalidated signals
- 4782b41: Fix conditionally signals (lazy branches) not being re-computed upon activation
- bf6af3b: - Fix a memory leak when computed signals and effects are removed

## 1.0.1

### Patch Changes

- 5644c1f: Fix stale value returned by `.peek()` when called on a deactivated signal.

## 1.0.0

### Major Changes

- 2ee8489: The v1 release for the signals package, we'd to see the uses you all
  come up with and are eager to see performance improvements in your
  applications.

### Minor Changes

- ab22ec7: Add `.peek()` method to read from signals without subscribing to them.

### Patch Changes

- b56abf3: Throw an error when a cycle was detected during state updates

## 0.0.5

### Patch Changes

- 702a9c5: Update TypeScript types to mark computed signals as readonly

## 0.0.4

### Patch Changes

- 4123d60: Fix TypeScript definitions not found in core

## 0.0.3

### Patch Changes

- 1e4dac5: Add `prepublishOnly` scripts to ensure we're publishing fresh packages

## 0.0.2

### Patch Changes

- 2181b74: Add basic signals lib based of prototypes
