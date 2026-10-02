# Releasing Flashlight

This guide is for maintainers. Public releases are created from `v*` tags by the release workflow.

## Version policy

Flashlight is pre-1.0. Use Semantic Versioning pragmatically:

- patch: compatible fixes and documentation
- minor: new workflows, hardware support, or notable behavior changes
- major: reserved for a stable 1.0 contract or incompatible data/config changes

Keep `package.json` and `CHANGELOG.md` aligned. Stage JSON migrations must remain backward-compatible
or be called out prominently.

## Prerequisites

- Clean `main` branch with required CI passing
- Node version from `.nvmrc`
- GitHub Actions enabled with `contents: write` allowed for the release workflow
- macOS signing/notarization secrets if distributing trusted macOS artifacts
- Windows code-signing configuration if distributing a trusted Windows installer
- Final application icons in `build/` before the first branded public release

The workflows can create unsigned artifacts when signing credentials are absent. Clearly label
unsigned builds as development/pre-release artifacts.

## Release checklist

1. Review all commits since the previous tag.
2. Move relevant `CHANGELOG.md` entries from Unreleased into a dated version section.
3. Update the version without creating a tag:

   ```bash
   npm version <patch|minor|major> --no-git-tag-version
   npm install
   ```

4. Run:

   ```bash
   npm ci
   npm run verify
   npm audit --omit=dev
   ```

5. Complete the manual matrix below.
6. Commit the release metadata, merge to `main`, and create an annotated tag:

   ```bash
   git tag -a vX.Y.Z -m "Flashlight vX.Y.Z"
   git push origin main
   git push origin vX.Y.Z
   ```

7. Watch the Release workflow on all three operating systems.
8. Download every artifact from the draft release and smoke-test it.
9. Edit generated release notes as needed and publish the draft.

## Manual release matrix

At minimum:

| Area                                           | macOS arm64                  | macOS x64 | Windows x64 | Linux x64 |
| ---------------------------------------------- | ---------------------------- | --------- | ----------- | --------- |
| Install/launch/quit                            | Required                     | Required  | Required    | Required  |
| Camera and microphone permission               | Required                     | Required  | Required    | Required  |
| Art-Net output/blackout                        | Required on one macOS system | Optional  | Required    | Optional  |
| sACN output                                    | Required on one system       | Optional  | Optional    | Optional  |
| Enttec/SerialPort enumeration                  | Required on one system       | Optional  | Required    | Optional  |
| OS2L with VirtualDJ                            | Required on one system       | Optional  | Required    | Optional  |
| MIDI learn/action                              | Required on one system       | Optional  | Required    | Optional  |
| 30+ minute recording and conversion            | Required                     | Optional  | Required    | Optional  |
| Library move + database restore on copied data | Required                     | Optional  | Required    | Optional  |

Also test multiple monitors, camera/lighting pop-outs, projector output, the floating recording
monitor, sleep prevention, force-blackout, and interrupted-recording repair before significant
releases.

## Signing notes

Electron Builder reads its standard signing environment variables. Keep secrets in GitHub Actions,
never in repository files. macOS distribution normally needs a Developer ID Application identity,
notarization credentials, hardened runtime, and verification with `codesign`, `spctl`, and
`stapler`. Windows distribution should use a trusted code-signing certificate and verify both the
installer and installed executable.

Consult current Electron Builder documentation when configuring secrets; provider requirements and
secret names can change.

## Rollback

Do not move or reuse a published tag. If an artifact is unsafe, mark the release as a pre-release or
remove its assets, document the problem, and publish a new patch version. Data-format migrations and
database write regressions warrant an immediate advisory in the README/release notes.
