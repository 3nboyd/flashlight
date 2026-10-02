# Privacy

Flashlight is a local-first desktop application. The project does not operate an account service,
analytics endpoint, advertising network, or hosted backend, and the application contains no
telemetry code.

## Data the app can access

Only after the user selects, enables, or permits the relevant workflow, Flashlight can access:

- selected music folders and DJ database files
- selected recording folders and recordings created there
- camera video streams
- microphone or audio-input streams
- MIDI input devices
- serial ports used for supported DMX interfaces
- local-network interfaces and lighting/OS2L traffic
- application settings, lighting stages, backups, and renderer preferences

## Where data goes

Camera/audio frames are processed locally for previews, effects, analysis, and recording. MediaPipe
model and WebAssembly files are bundled with the application; inference does not require uploading
frames to a service. Music metadata, cue information, rename previews, lighting calculations, and
FFmpeg conversions are also local.

Art-Net, sACN, discovery, and OS2L necessarily send or receive control data on the selected/local
network. They are not intended for the public internet.

The app opens external web links in the operating system's browser but does not otherwise transmit
project data. Installing dependencies or downloading releases through developer tools is governed
by those tools and services, not by the running application.

## Storage and deletion

- App/library settings, lighting stages, and backups are stored under Electron's per-user app-data
  directory.
- Camera, projector, director, and recording preferences are stored in the Electron renderer
  profile's `localStorage`.
- Recordings are stored in the user-selected folder.
- Music files and configured DJ databases remain in their existing locations.

Removing the application may not remove its app-data directory or recordings. Users can delete
those locations separately according to their operating system. File Explorer deletion is
permanent and is not a privacy-erasure mechanism for backups or copies elsewhere.

## Reports and contributions

Before sharing logs, screenshots, recordings, stage projects, or test libraries in GitHub issues,
remove personal paths, device identifiers, identifiable people, and music you are not authorized to
distribute.
