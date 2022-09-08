# @preact/signals

## 1.0.3

### Patch Changes

- ab5bd99: Fix swapping and HMR for signals when used as text

## 1.0.2

### Patch Changes

- 2383684: Correctly replace props-value with peeked value
- Updated dependencies [5644c1f]
  - @preact/signals-core@1.0.1

## 1.0.1

### Patch Changes

- c7c0d91: Add marker for devtools to `Text` that is created when a signal is passed into JSX

## 1.0.0

### Major Changes

- 2ee8489: The v1 release for the signals package, we'd to see the uses you all
  come up with and are eager to see performance improvements in your
  applications.

### Patch Changes

- Updated dependencies [ab22ec7]
- Updated dependencies [2ee8489]
- Updated dependencies [b56abf3]
  - @preact/signals-core@1.0.0

## 0.0.4

### Patch Changes

- 702a9c5: Update TypeScript types to mark computed signals as readonly
- 5f8be64: Optimize size of CJS & UMD bundles.
- Updated dependencies [702a9c5]
  - @preact/signals-core@0.0.5

## 0.0.3

### Patch Changes

- 812e7b5: Fix `batch()` not re-exported from preact adapter
- 8e9bf67: Fix incorrect TypeScript paths
- f71ea95: Avoid incrementing Preact adapter when core changes
- Updated dependencies [4123d60]
  - @preact/signals-core@0.0.4

## 0.0.2

### Patch Changes

- 1e4dac5: Add `prepublishOnly` scripts to ensure we're publishing fresh packages
- 9ccf359: Align signal rendering in Text positions with VDOM text rendering - skip rendering of `null`, `undefined` and `boolean` values.
- 1171338: Fix wrong path for TypeScript definitions in `package.json`
- Updated dependencies [1e4dac5]
  - @preact/signals-core@0.0.3
