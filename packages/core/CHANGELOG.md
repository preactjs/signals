# @preact/signals-core

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
