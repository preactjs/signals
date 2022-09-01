# @preact/signals

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
