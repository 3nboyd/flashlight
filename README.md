# Flashlight

[![CI](https://github.com/3nboyd/flashlight/actions/workflows/ci.yml/badge.svg)](https://github.com/3nboyd/flashlight/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Flashlight is an open-source desktop production toolkit for DJs. It combines live, beat-synced
DMX lighting, multi-camera visuals and recording, and safety-conscious music-library utilities in
one Electron application for macOS, Windows, and Linux.

> [!IMPORTANT]
> Flashlight is pre-1.0 software. Test DMX output with fixtures at safe intensity, and use copies
> of valuable DJ libraries until you have verified the workflow with your own hardware and files.

## Highlights

- **Live operator cockpit** — run lighting and cameras side by side, collapse either pane, or move
  each one to a separate display.
- **Beat-synced DMX** — output Art-Net, sACN/E1.31, or Enttec DMX USB Pro-compatible data at a
  configurable frame rate.
- **Three beat sources** — VirtualDJ OS2L is preferred, live audio analysis is the fallback, and
  manual BPM/tap tempo is always available.
- **Performance lighting** — scenes, animated effects, fixture groups, position-aware movement,
  performance pads, MIDI learn, Smart Mode, Autopilot, blackout, strobe, blinder, and emergency
  force-blackout.
- **Rig authoring** — multiple stages, a live stage visualizer, built-in and custom fixtures,
  per-fixture limits, address-overlap checks, fixture identification, and Art-Net discovery.
- **Multi-camera production** — simultaneous camera inputs, manual cuts, camera roles, per-camera
  effects, MediaPipe pose/face tracking, a beta automatic director, collage view, and independent
  projector output.
- **Long-form recording** — stream MediaRecorder chunks directly to disk, optionally capture
  music-quality audio, compensate for camera/audio delays, record separate feeds, repair WebM
  files, and transcode to MP4 or MOV with bundled FFmpeg.
- **Library utilities** — scan common audio formats and Serato MP3 cue tags, browse and reorganize
  files, keep configured Serato/VirtualDJ paths synchronized after moves, clean filenames, and
  restore automatic database backups.

## Current feature status

This table distinguishes complete user workflows from lower-level format support.

| Area                   | Available in the app                                                                  | Current boundary                                                              |
| ---------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Lighting               | Art-Net, sACN, Enttec Pro, OS2L, audio analysis, scenes, MIDI, Smart Mode, Autopilot  | Open DMX/raw FTDI dongles are not supported                                   |
| Camera                 | Multi-camera preview, effects, roles, manual cuts, projection, pop-outs               | Auto-director and drop effects are beta                                       |
| Recording              | Disk streaming, optional audio, A/V delay, separate feeds, repair, MP4/MOV conversion | Format availability depends on Chromium/OS codecs                             |
| Library scan           | Metadata for MP3, FLAC, WAV, AIFF, M4A/MP4; Serato cues/loops for MP3                 | Serato cue tags in FLAC/M4A are not read yet                                  |
| File management        | Copy, move, rename, delete, batch operations, cross-volume moves                      | Deletion is permanent; use carefully                                          |
| DJ database paths      | Serato database/crates and VirtualDJ XML paths update after moves/renames             | Only configured databases are touched                                         |
| Cue conversion engines | Tested Serato, VirtualDJ, and rekordbox mapping/parser modules                        | Cross-platform cue writing and rekordbox export are not wired into the UI yet |

## Screens and workflows

- **Live** is the performance cockpit: lighting controls, stage preview, cameras, projector output,
  and recording.
- **Setup** contains stages, fixture patching, scenes, Smart Mode, Autopilot, performance pads, and
  MIDI assignments.
- **Settings** contains audio input, DMX output, OS2L, MIDI device selection, appearance, backups,
  and music-library paths.
- **Music** contains the library scanner, file explorer, rename review, and backup browser.

Detailed guides:

- [Installation and first run](docs/SETUP.md)
- [Lighting and hardware](docs/LIGHTING.md)
- [Camera, visuals, and recording](docs/CAMERA_AND_RECORDING.md)
- [Music-library tools](docs/LIBRARY_TOOLS.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)

## Requirements

For development:

- Node.js 22.12 or newer
- npm 11 (the repository records the expected npm version in `package.json`)
- macOS 13+, a current 64-bit Windows release, or a modern 64-bit Linux distribution

Optional runtime hardware:

- An Art-Net or sACN node, or an Enttec DMX USB Pro-compatible serial interface
- One or more cameras supported by Chromium
- An audio loopback/virtual cable if DJ software audio should drive lighting or recording
- A Web MIDI controller
- A second display or projector

## Development

```bash
# After cloning your fork/repository:
cd flashlight
npm ci
npm run dev
```

Run the same checks used by continuous integration:

```bash
npm run verify
```

Individual commands:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run format:check
```

Create local installers:

```bash
npm run build:mac
npm run build:win
npm run build:linux
```

Native installers should be built on their target operating system. Signing and notarization
require platform credentials; see [the release guide](docs/RELEASING.md).

## Architecture

```text
src/
  core/       Framework-free business logic, parsers, DMX engine, and unit tests
  main/       Electron lifecycle, filesystem/network/hardware services, IPC handlers
  preload/    Typed contextBridge API exposed to renderers
  renderer/   React UI, Zustand state, camera/audio capture, visual effects
```

Important boundaries:

- Renderers have `nodeIntegration` disabled and use the typed preload API.
- Filesystem, FFmpeg, serial, UDP, OS2L, backup, and window-management work stays in the main
  process.
- The lighting output loop runs in the main process and is not tied to React rendering.
- Camera capture and visual composition run in the renderer because they depend on browser media
  and canvas APIs.
- Core format writers preserve unknown data where possible and snapshot configured DJ databases
  before overwriting them.

See [Architecture](docs/ARCHITECTURE.md) for the complete component and data-flow description.

## Data and privacy

Flashlight is local-first. It does not require an account or a hosted backend. Camera, audio,
MIDI, library, lighting, and recording data remain on the machine unless the user moves or shares
the resulting files. Art-Net, sACN, OS2L, and discovery traffic are limited to the configured/local
network path.

Application settings and lighting stages are stored in Electron's user-data directory. Camera,
output, and recording preferences are currently stored in the renderer profile's `localStorage`.
Recordings are written to the folder selected by the user.

See [PRIVACY.md](PRIVACY.md) for the complete data and permission summary.

## Project status and safety

- Version: `0.1.0` (pre-1.0)
- Tests focus on framework-free core behavior. Hardware, Electron window, and camera workflows
  still require manual release testing.
- The repository contains no telemetry or automatic updater.
- Direct rekordbox USB database writing is not supported.
- Binary DJ formats are community reverse-engineered rather than vendor-supported.

Before a show, test the complete chain with the exact computer, adapters, network, fixtures,
cameras, MIDI devices, and recording destination you will use.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md), the [Code of Conduct](CODE_OF_CONDUCT.md), and
[SECURITY.md](SECURITY.md) before opening a pull request or security report. Format/parser changes
should include preservation or round-trip tests. Hardware changes should document the device and
manual verification performed.

## Changelog and license

Release history is maintained in [CHANGELOG.md](CHANGELOG.md). Flashlight is available under the
[MIT License](LICENSE). Bundled runtime notices are listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
