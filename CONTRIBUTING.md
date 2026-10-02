# Contributing to Flashlight

Thanks for helping improve Flashlight. The app touches live hardware and irreplaceable music
libraries, so correctness, preservation, and predictable failure modes matter more than cleverness.

## Before you start

1. Search existing issues before opening a new one.
2. Use a feature request for user-facing behavior and a bug report for reproducible failures.
3. For large changes, describe the intended workflow and data-safety impact before implementation.
4. Never test format writers against the only copy of a DJ library.

## Local setup

```bash
nvm use
npm ci
npm run dev
```

Node.js 22.12 or newer is required. Development commands are documented in the README.

## Branches and commits

- Branch from `main`.
- Keep each commit focused and use an imperative subject such as `Fix Art-Net interface binding`.
- Do not mix generated artifacts, unrelated formatting, or personal stage/library data into a PR.
- Do not commit `out/`, `dist/`, recordings, `.env` files, or Electron user-data directories.

## Code boundaries

- Put framework-free business logic in `src/core` and cover it with Vitest.
- Keep privileged filesystem, network, serial, FFmpeg, and window operations in `src/main`.
- Expose renderer capabilities through the typed API in `src/preload/index.ts`.
- Keep renderer code focused on UI, browser media APIs, canvas composition, and view state.
- Preserve unknown records/fields when editing reverse-engineered DJ formats.

## Required checks

Run the full local gate before requesting review:

```bash
npm run verify
npm audit --omit=dev
```

Add or update tests when changing parsers, format writers, cue mapping, file operations, backups,
DMX packets, fixture rendering, lighting behavior, the director, or FFmpeg arguments.

## Manual verification

Automated tests cannot emulate a complete show rig. Include relevant manual results in the PR:

- OS and architecture
- DJ software and version
- Fixture/node/interface model and connection type
- Camera/audio/MIDI device model
- Steps exercised and expected result
- Whether output stop and emergency blackout were tested
- Recording duration, format, resolution, FPS, audio source, and conversion result

## Pull requests

Keep the pull-request template intact. Explain user-visible behavior, risks, compatibility, tests,
and documentation changes. Screenshots or short recordings are useful for UI work, but remove
personal library paths and identifiable footage.

Maintainers may ask for a smaller change, preservation fixtures, or more hardware evidence before
merging safety-sensitive work.

## Reporting security problems

Do not open a public issue for a vulnerability that could expose local files, execute commands,
corrupt libraries, or access camera/microphone data. Follow [SECURITY.md](SECURITY.md).
