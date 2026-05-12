# Contributing

## Releasing Signals (Maintainers only)

This guide is intended for core team members that have the necessary rights to merge pull requests to the `main` branch.

To create a new release, merge the "Version Packages" PR opened by the changesets-action. The release workflow will pause at the `npm` environment approval gate, then publish packages and create GitHub releases after approval.
