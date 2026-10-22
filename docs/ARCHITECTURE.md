# Architecture

## Overview

Flashlight is a single Electron application with four layers:

```text
React renderer ──typed contextBridge──> Electron main process ──> OS / devices / network
      │                                        │
      └──────────── imports pure types/logic ──┴──> framework-free core
```

The renderer owns interactive UI, browser media capture, Web MIDI, audio analysis, and canvas
composition. The main process owns files, backups, UDP/TCP/serial output, FFmpeg, auxiliary
windows, and the real-time DMX host. `src/core` contains code that can run under Node without
Electron or React.

## Processes and entry points

### Main process

`src/main/index.ts` creates the primary window, grants the required media/MIDI permissions,
registers IPC handlers, prevents background throttling, and disposes output services during quit.

Main-process services:

- `ipc/settings.ts`: disk-backed application settings
- `ipc/backup.ts`: snapshot listing, pruning, and restore
- `ipc/library.ts`: recursive audio scanning
- `ipc/fileops.ts`: file operations followed by DJ database path synchronization
- `ipc/rename.ts`: previewed/batched filename cleanup
- `ipc/lighting.ts`: lighting project and live engine control
- `ipc/output.ts`: up to six projector windows
- `ipc/popout.ts`: detachable Live camera and lighting windows
- `ipc/monitor.ts`: always-on-top recording monitor and shared recording status
- `ipc/recording.ts`: disk streams, FFmpeg conversion/repair, and file reveal

### Preload

`src/preload/index.ts` is the renderer's only privileged API. Any new IPC endpoint must be added to
the main process and the preload API together. `contextIsolation` remains enabled and renderer
`nodeIntegration` remains disabled.

### Renderer

`src/renderer/src/main.tsx` selects one of five surfaces by URL hash:

- normal route: complete application
- `#output`: projector/stage-screen output
- `#popout-camera`: detached camera pane
- `#popout-lighting`: detached lighting pane
- `#monitor`: floating recording monitor

The primary application uses React 18 and two Zustand stores: application settings and lighting
project/status. Camera and recording state is mostly local component state plus `localStorage`.

### Core

`src/core` contains:

- binary readers/writers
- Serato, VirtualDJ, and rekordbox format modules
- unified track and cue types
- file/path synchronization and backup logic
- deterministic rename rules
- camera director scoring
- DMX packet encoders and universe abstraction
- fixture types/import/library
- beat, audio, Smart Mode, scene, and lighting rendering logic
- FFmpeg argument construction

Vitest intentionally targets `src/core/**/*.test.ts`.

## Lighting data flow

```text
OS2L beat grid ───────────────┐
Renderer audio analyzer ──────┼─> LightingHost beat/song state
Manual BPM / tap ─────────────┘            │
                                           v
Lighting project + active scene + overrides + patched fixtures
                                           │
                                           v
                              LightingEngine.renderTick()
                                           │
                                           v
                        per-universe 512-byte DMX buffers
                                  │        │       │
                               Art-Net    sACN   Enttec Pro
```

The host ticks with `setInterval` at the configured output FPS. OS2L wins while fresh, live audio
is the next beat source, and manual clock data is the fallback. Audio also feeds kick, surge,
rhythm, and song-section detectors used by adaptive effects and Smart Mode.

Stopping output sends a blackout frame. Force-blackout sends repeated all-zero packets across a
safety range of universes and both configured/broadcast Art-Net paths.

## Camera and recording data flow

Each enabled camera gets a `MediaStream`, a preview tile, optional pose/face analysis, a role, and
visual configuration. `CameraDirector` scores eligible signals by role, presence, facing, motion,
audio state, priority, hold time, hysteresis, and optional beat alignment. Manual selection wins.

The selected program feed is composed to canvas. Projector windows independently select a program
or camera source and effect stack. Lighting status supplies beat phase and current rig/screen color
to camera visuals.

Recording uses canvas `captureStream()` plus optional audio. `MediaRecorder` emits periodic chunks;
the preload API streams each chunk to a main-process `WriteStream` immediately. This bounds renderer
memory and leaves a mostly recoverable file after interruption. FFmpeg conversion happens after
recording, never in the live capture loop.

## Music-library data flow

The scanner walks configured folders and uses `music-metadata` for common tags. MP3 files also pass
through `SeratoTagIO`; decoded Markers2 entries become unified cues and loops.

Moves and renames run through `FileOperations`. When Serato or VirtualDJ synchronization is enabled,
`LibrarySync` updates matching paths in Serato database/crate files and VirtualDJ `database.xml`.
Every modified database/crate is snapshotted immediately before writing.

Format conversion modules exist in core, but cue-writing and rekordbox import/export are not yet
connected to an end-user workflow.

## Persistence

| Data                                         | Storage                                                |
| -------------------------------------------- | ------------------------------------------------------ |
| Application/library settings                 | `settings.json` under Electron `userData`              |
| Lighting stage index/projects                | `lighting-stages/` under Electron `userData`           |
| Legacy lighting project                      | Migrated from `lighting-project.json`                  |
| Backups and manifest                         | Backup directory under Electron `userData`             |
| Camera/director/output/recording preferences | Renderer profile `localStorage`                        |
| MIDI mapping                                 | Lighting project, with legacy `localStorage` migration |
| Recordings                                   | User-selected folder                                   |

Stage JSON is normalized when loaded so older projects receive current defaults.

## Testing boundary

Core parsers, writers, cue mapping, backup/file operations, director logic, DMX packets, fixture
rendering, audio detection, lighting effects, Smart Mode, and FFmpeg arguments have unit tests.

The following require manual or future integration coverage:

- Electron IPC and multi-window synchronization
- permissions and device enumeration
- real Art-Net/sACN/serial output
- OS2L discovery against DJ software
- browser camera/audio/MIDI behavior
- long-duration recording and conversion
- signed/notarized installers

See [RELEASING.md](RELEASING.md) for the manual release matrix.
