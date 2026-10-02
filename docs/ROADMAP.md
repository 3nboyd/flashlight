# Roadmap

This roadmap describes likely directions, not promised dates. Safety and reliability work can take
priority over new features.

## Release foundation

- Complete signed/notarized installer setup and final branded assets.
- Add packaged-app smoke tests and renderer/main integration coverage.
- Establish a hardware compatibility matrix from reproducible reports.
- Exercise long-duration recording and full show-rig soak tests.

## Library workflows

- Wire conflict-aware cue/loop synchronization into the UI.
- Expose rekordbox XML import/export with previews and backups.
- Add Serato FLAC and M4A cue-tag support.
- Add a durable indexed library rather than scan-only in-memory results.
- Investigate MusicBrainz/AcoustID fallback for severely damaged filenames.

## Lighting

- Expand tested fixture definitions and fixture-profile interchange.
- Investigate Ableton Link when a maintainable cross-platform integration is available.
- Improve hardware diagnostics and record/replay testing for network/serial output.

## Camera and recording

- Move beta auto-director behavior behind stronger calibration and test tooling.
- Add integration tests for multi-window state synchronization.
- Add recording session manifests and storage-space warnings.
- Evaluate GPU/performance controls for larger multi-camera rigs.

Direct rekordbox USB `.pdb` writing remains out of scope until a safe, well-tested writer is
practical. Raw Open DMX USB interfaces remain unsupported.
