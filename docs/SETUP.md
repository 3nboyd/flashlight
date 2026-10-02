# Installation and first run

## Development installation

```bash
# After cloning your fork/repository:
cd flashlight
nvm use
npm ci
npm run dev
```

Use Node.js 22.12 or newer. `npm ci` installs exactly the versions in `package-lock.json` and
rebuilds native dependencies for Electron through the postinstall script.

## Packaged installation

Download the artifact for your operating system and CPU architecture from the official GitHub
Releases page once releases are published.

- macOS: DMG or ZIP, Intel (`x64`) or Apple Silicon (`arm64`), macOS 13+
- Windows: NSIS installer, 64-bit
- Linux: AppImage, 64-bit

Unsigned development builds can trigger operating-system warnings. Public releases should be
signed; see [RELEASING.md](RELEASING.md).

## Permissions

Flashlight may request:

- **Camera** for previews, effects, projector output, and recording
- **Microphone/audio capture** for lighting analysis and optional recording audio
- **MIDI** for controller input
- **Local network** on macOS for Art-Net discovery/output and OS2L
- **Files and removable volumes** when selecting libraries, recordings, or USB storage

Grant only permissions needed for the workflows you use. If a device remains unavailable, fully
quit and reopen the app after changing permissions in the operating system.

## First-run checklist

1. Open **Settings → Appearance** and select an accent if desired.
2. Open **Setup → Stages & Rig** and create or name a stage.
3. Patch fixtures in **Setup → Fixtures**, checking universe, address, mode, and channel footprint.
4. Configure **Settings → DMX Output** and test at low intensity.
5. Configure **Settings → OS2L Link** or select an audio input as the backup beat source.
6. Add scenes/presets and assign performance pads.
7. If needed, open MIDI assignments and learn buttons/faders.
8. In **Live**, enable cameras, choose camera roles, and test manual cuts.
9. Select a recording directory and run a short recording/conversion test.
10. Stop output and confirm all fixtures go dark before relying on the rig at a show.

## Virtual audio routing

Lighting analysis and recording can capture any input exposed to Chromium. To feed a DJ software
master into the app, route the master to a virtual audio device and select that device in DJ
Companion. Disable voice-processing features in the operating system or driver; the app requests
music-oriented capture constraints, but drivers can still apply processing.

Avoid monitoring the virtual input back into the same output path, which can create feedback.

## VirtualDJ OS2L

1. Enable OS2L in Flashlight and note the displayed address/port.
2. Start Flashlight before or alongside VirtualDJ.
3. Allow local-network access and ensure both processes are not blocked by a firewall.
4. Use VirtualDJ's OS2L network setting if automatic DNS-SD discovery does not connect.
5. Confirm **Beat source: OS2L** in Live/Setup status.

OS2L supplies authoritative BPM, beat, bar, and phrase position. Audio analysis can still supply
level/kick information for reactive effects.

## Library setup

Add music folders under **Settings → Appearance** (the page also contains library settings).
Configure the `_Serato_` root and/or VirtualDJ `database.xml` only if moves and renames should update
those applications. Start with copied libraries and verify results before using originals.

See [LIBRARY_TOOLS.md](LIBRARY_TOOLS.md) for exact behavior.
