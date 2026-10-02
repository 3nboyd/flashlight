# Camera, visuals, and recording

## Camera workflow

The Live camera pane enumerates Chromium-compatible video devices. Enable the cameras needed for the
set and assign each a role such as head-on, laptop, side, overhead, or crowd. Each camera can have a
priority, look-to-switch behavior, fit mode, delay, and visual treatment.

Capture defaults are performance-conscious. Higher capture resolution and multiple MediaPipe
detectors increase GPU/CPU load; validate sustained frame rates before a long recording.

## Program switching

Manual cuts select the program camera immediately. MIDI notes can be mapped to camera cuts and the
auto-director toggle.

The beta auto-director scores live camera signals using role, presence, facing direction, board
attention, motion, audio energy, configured priority, minimum/maximum shot length, hysteresis, and
optional beat alignment. A manual selection remains authoritative until automatic direction resumes.

The director intentionally excludes dead/dark feeds and applies a special rule to laptop views so
they are favored when the DJ is working the controls rather than looking toward that camera.

## Visuals and projector output

Visual modes include the untreated camera, monochrome, pose/face-driven drawings, echo/sketch
treatments, and generative backgrounds. Effects can follow lighting color and beat state. Shift-click
combines supported effects as overlays.

Projector windows are independent of recording and camera tiles. They can use the program feed or a
specific camera, select their own effect, use stage-screen color sources, and show an overlay. Up to
six output windows can be opened. External displays open full-screen; without an external display,
the app opens a movable framed preview.

The **effects only for projector** option keeps camera previews and recordings clean while applying
effects to stage output.

## Recording design

The renderer composes the program canvas and uses `MediaRecorder`. Approximately one-second chunks
are sent to the main process and appended to disk immediately. This avoids holding a multi-hour set
in memory and limits damage after a crash or power loss.

Available choices depend on Chromium and the host OS:

- capture codec/container offered by `MediaRecorder`
- maximum record height and FPS
- optional audio device
- separate camera recordings
- post-record output as MP4 or MOV
- high, balanced, or small FFmpeg quality

MP4/MOV conversion is a post-process using bundled FFmpeg and H.264/AAC settings. Keep the source
WebM until the converted file has been played and checked.

## A/V synchronization

USB cameras and audio interfaces can have different latency. Flashlight supports:

- per-camera video delay
- a global camera push-forward value, implemented by delaying the other paths
- recording audio delay

Calibrate with a visible clap or transient, inspect the recorded result, and adjust in small steps.
Projector latency and recorded A/V sync are separate concerns.

## Recording monitor

The floating monitor is always on top and shows the final program plus shared recording state. It is
intended as a confidence view while another application is focused. Closing the monitor does not
stop recording.

## Recovery

If a recording was interrupted, select it with **Repair**. FFmpeg regenerates timestamps and writes
a new `-fixed` copy without overwriting the original. Repair cannot recover chunks that were never
written or media lost to storage failure.

## Pre-record checklist

- Confirm camera permissions and stable FPS for every enabled device.
- Confirm the program source, projector source, and effects-only setting.
- Select a recording folder with ample free space and no unreliable network mount.
- Select and meter the correct audio device; avoid clipping near 0 dBFS.
- Record at least one minute, stop cleanly, convert, and play the result with audio.
- Verify A/V sync, resolution, FPS, separate feeds, and file-reveal behavior.
- Prevent sleep and connect the computer to power.
