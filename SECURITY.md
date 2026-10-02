# Security Policy

## Supported versions

Flashlight is currently pre-1.0. Security fixes are applied to the latest commit on `main` and to
the newest published release when releases exist. Older development snapshots are not supported.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting feature for this repository if it is enabled. If it is
not available, contact the repository owner privately before publishing details. Do not include
real DJ databases, recordings, credentials, device identifiers, or private filesystem paths in the
initial report.

Include:

- affected version or commit
- operating system and architecture
- impact and realistic attack scenario
- minimal reproduction steps or proof of concept
- whether untrusted files, XML, media, network packets, or renderer content are required
- suggested mitigation, if known

You should receive acknowledgment within seven days. A fix timeline depends on severity,
reproducibility, and hardware availability. Coordinated disclosure is preferred.

## Security model

- Renderer `nodeIntegration` is disabled and context isolation is enabled.
- Privileged operations are exposed through a typed preload bridge.
- Camera, microphone, MIDI, serial, local-network, filesystem, and recording access require an
  explicit user workflow and/or operating-system permission.
- DJ database writes are preceded by local snapshots where the workflow uses `BackupManager`.
- The app is local-first and has no account system, analytics service, or cloud backend.

## User safety

- Download releases only from this project's official GitHub Releases page.
- Treat unsigned or unnotarized development builds as test software.
- Test library modifications on copies and retain independent backups.
- Keep the application and operating system current.
- Do not expose OS2L or lighting-control ports to the public internet.
