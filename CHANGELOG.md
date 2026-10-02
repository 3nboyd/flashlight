# Changelog

All notable changes to Flashlight are documented here. The project follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and intends to use Semantic Versioning once
public releases begin.

## [Unreleased]

### Added

- Complete project, operator, hardware, library, troubleshooting, contribution, security, and
  release documentation.
- GitHub Actions workflows for validation and tagged cross-platform releases.
- GitHub issue forms, pull-request template, dependency update configuration, Node version file,
  and editor defaults.
- Linux packaging script and deterministic platform/architecture artifact names.
- macOS camera, microphone, Bonjour, and local-network permission descriptions.

### Changed

- Updated the product description to cover lighting, camera, recording, and library tooling.
- Upgraded Electron from the unsupported 33 line to the supported 44 line.
- Upgraded Electron Builder, Electron Vite, Vite, Vitest, the React Vite plugin,
  `fast-xml-parser`, and `music-metadata`.
- Kept malformed audio files visible as scan errors after the metadata parser upgrade.
- Set the development baseline to Node.js 22.12 or newer.

### Security

- Removed all reported production dependency vulnerabilities present in the previous lockfile.

## [0.1.0] - 2026-08-29

First development milestone. This version was assembled through incremental commits and was not
previously published as a tagged GitHub release.

### Added

- Electron, React, and TypeScript desktop application with typed preload APIs.
- Music library scanning, Serato MP3 cue/loop reading, VirtualDJ and Serato path synchronization,
  file management, automatic backups, restore, and deterministic filename cleanup.
- DMX engine with Art-Net, sACN/E1.31, and Enttec Pro-compatible output.
- OS2L beat-grid server/discovery, audio BPM analysis, tap tempo, beat clock, and source fallback.
- Fixture library, custom fixture profiles, patch validation, per-fixture limits, stage placement,
  multi-stage saves, fixture identification, and live universe visualization.
- Scene editor, categorized preset library, recoverable scene trash, performance pads, saved pad
  layouts, MIDI learn, favorite colors, live overrides, Autopilot, and Smart Mode.
- Adaptive song-arc effects, kick/peak detection, position-aware movement, screen fixtures, and
  experimental scenes.
- Unified Live cockpit with detachable lighting and camera panes.
- Multi-camera capture, camera roles and priority, MediaPipe pose/face analysis, manual switching,
  beta automatic direction, visual layering, collage mode, and projector outputs.
- Disk-streamed recording, optional music-quality audio, separate camera feeds, resolution/FPS and
  quality controls, per-camera video delay, global/audio delay, live rate/FPS meters, recording
  monitor, FFmpeg conversion, and damaged-file repair.
- Art-Net diagnostics, node discovery, directed-interface binding, one-button automatic connection,
  automatic reconnect, force-blackout, and safe blackout on shutdown.

### Known limitations

- Cross-platform cue writing and rekordbox XML import/export are implemented as core modules but
  are not exposed as complete UI workflows.
- Auto-director and experimental scenes are beta features.
- Hardware and camera paths depend on host drivers, permissions, codecs, and network topology.
