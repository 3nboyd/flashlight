# Troubleshooting

## Development

### Native module or ABI errors

Run:

```bash
npm ci
npm run postinstall
```

This rebuilds SerialPort for the installed Electron version. Do not copy `node_modules` between
operating systems or CPU architectures.

### Build succeeds but the app is blank

Check the terminal/devtools error, confirm `out/renderer/index.html` exists after `npm run build`,
and rerun `npm ci`. MediaPipe files should appear under `out/renderer/mediapipe`.

## Lighting

### Art-Net node is not discovered

- Confirm the node and computer are on the same wired subnet.
- Use Auto-detect & Connect; discovery replies are not required for output.
- Check the selected interface and directed broadcast in diagnostics.
- Temporarily inspect firewall/local-network permission behavior.
- Confirm the node uses Art-Net UDP port 6454 and the expected universe numbering.

### Packets send but fixtures do not respond

- Match fixture mode, start address, universe, and physical DMX chain.
- Use Identify on one fixture.
- Check whether the node expects Art-Net net/subnet/universe mapping different from the patch.
- Verify the master, blackout, scene dimmer, and fixture intensity limits.
- Test a short known-good cable and terminator.

### Lights remain stuck

Use Force Blackout, then stop output. If the node holds its last frame despite repeated zero output,
use the node/fixture's physical controls or disconnect DMX/mains according to its manual.

### OS2L does not connect

Start both applications, enable OS2L, verify the port, allow local networking, and enter the shown
address manually in VirtualDJ if discovery fails. Confirm another process is not already using the
port.

### Audio reacts but BPM is wrong

Prefer OS2L when possible. With audio BPM, use a clean master feed rather than a microphone, avoid
voice processing, and use manual BPM/tap for sparse or non-percussive material.

## Camera and recording

### A camera is missing or black

- Grant camera permission and restart the app.
- Close other applications using the camera.
- Disable/re-enable the device and try the lower capture resolution.
- Test the camera in the operating system's camera application.

### Preview or recording is slow

Reduce capture/record resolution or FPS, disable unused cameras, reduce MediaPipe overlays, and test
without projector windows. Check thermal throttling and GPU driver behavior.

### No recording audio

Enable audio recording, select the correct input, confirm the meter moves, and verify OS permission.
DJ software output usually requires a loopback/virtual audio device.

### Converted file fails

Keep the source WebM, confirm free disk space, and try Repair before conversion. Paths inside cloud
sync/network folders can be less reliable than local storage.

### Monitor timer is stale

Close and reopen the floating monitor. Recording continues independently; verify the primary Live
panel before stopping or restarting anything.

## Library

### A track is skipped

The scan banner reports unreadable files. Verify extension, permissions, and that the file opens in a
media player. Malformed media can be rejected by metadata parsers.

### DJ software lost a moved track

Confirm synchronization was enabled before the move and the configured Serato/VirtualDJ path was
correct. Inspect the Backups view, restore the relevant database snapshot if needed, and move the
audio file back to its original path if the database was not updated.

### Restore does not cover a deleted audio file

Database snapshots do not back up the complete music library. Restore audio from the independent
backup used before testing.

## Reporting an issue

Use the matching GitHub issue form and include the app commit/version, OS/architecture, exact
hardware/software versions, logs, reproduction steps, and whether the problem reproduces with a
minimal stage or copied library. Remove personal paths, device identifiers, and identifiable media.
