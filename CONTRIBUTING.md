# Contributing

## Releasing Signals (Maintainers only)

This guide is intended for core team members that have the necessary
rights to publish new releases on npm.

1. Merge "Version Packages" PR opened by the changesets-action
2. Switch to the `main` branch and pull the merged PR
3. Run `pnpm release` to publish packages
4. Commit updated `pnpm-lock.yaml` if it changed and push it: `git push -f`
