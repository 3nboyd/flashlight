# Lighting and hardware

## Supported output

| Protocol           | Transport     | Notes                                                                                  |
| ------------------ | ------------- | -------------------------------------------------------------------------------------- |
| Art-Net            | UDP/IP        | Broadcast, directed broadcast, or node IP; discovery and automatic interface selection |
| sACN / E1.31       | UDP multicast | Multicast output by universe                                                           |
| Enttec DMX USB Pro | Framed serial | One selected universe per interface                                                    |

Raw Open DMX/FTDI dongles are not supported because reliable DMX timing cannot be maintained with
ordinary serial writes. Enttec Pro-compatible means the interface implements the framed Pro
protocol, not merely that it has a USB connector.

## Network setup

For Art-Net, connect the computer and node to the same interface/subnet. **Auto-detect & Connect**
chooses a likely wired interface, calculates its directed broadcast address, binds output to that
interface, and saves the target. Discovery is helpful but not mandatory; some nodes do not answer
polls even though they accept broadcast data.

If the computer also uses Wi-Fi, confirm diagnostics show the wired lighting interface. Do not
route show-control traffic over an untrusted or congested public network.

## Patching fixtures

Every patch selects a definition/mode, universe, 1-based DMX address, label, group, and optional
stage position. Flashlight checks overlapping channel ranges. The definition must match the mode
selected on the physical fixture.

Fixture limits can cap intensity, constrain/invert pan or tilt, and set home positions. Use
**Identify** to force one patched fixture white for signal tracing; identification clears
automatically after 30 seconds.

Custom profiles can be built in the editor or imported from the app's compact JSON description.
Use the exact channel chart from the fixture manual. Incorrect channel roles can cause unexpected
movement, strobing, or reset commands.

## Scenes and effects

A scene contains one or more targets. Targets address all fixtures, a fixture kind, or a group and
specify color, intensity, optional movement, and an effect. Effects include static looks, pulses,
chases, sweeps, color cycles, strobes, movement patterns, audio reactions, and adaptive song-arc
looks.

Momentary scenes restore the previous look when released. Deleted scenes move to a recoverable
trash area until permanently removed.

Built-in presets can be added to each stage. Compatibility is evaluated against the patched rig;
presets that require missing fixture capabilities are separated in the browser.

## Beat sources

Priority is:

1. fresh OS2L beat data
2. live audio BPM/onset analysis when audio-follow is enabled
3. manual BPM/tap clock

The current source is shown in status. Resync Downbeat aligns bar position without changing BPM.
Live audio also drives kick, level, fast-energy, surge, and adaptive song-section features.

## Smart Mode and Autopilot

- **Autopilot** rotates selected scenes every configured number of bars. It does not analyze mood.
- **Smart Mode** chooses among chill/main/peak pools using live musical features and configured
  sensitivity/hold behavior.

Smart Mode owns scene selection while enabled, so Autopilot is suspended. Both depend on a running
beat clock; Smart Mode additionally benefits from a valid audio input.

## MIDI

MIDI learn can bind notes to scenes and live actions and controls to master intensity, pan, tilt,
movement speed, reactivity, and color selection. Mappings are saved with a lighting stage. Devices
can be ignored so a DJ controller does not accidentally trigger lighting actions. Use Rescan after
connecting a controller if it does not appear.

## Safety controls

- **Blackout** applies a persistent zero-intensity override.
- **Stop Output** stops the engine and sends a final blackout frame.
- **Force Blackout** repeatedly broadcasts zero values across universes 0–15 plus configured/patched
  universes and the selected target. Use it for a node holding stale DMX.

Force Blackout is not a substitute for a physical emergency stop or mains disconnect. Keep moving
fixtures clear of people and structures, obey laser regulations, and test strobe exposure warnings.

## Pre-show checklist

- Verify fixture modes, addresses, universe numbering, and termination.
- Confirm the selected network interface/serial port.
- Start output at low master intensity and identify each fixture.
- Verify blackout, stop-output blackout, and force-blackout.
- Confirm beat source and BPM against the deck.
- Exercise MIDI mappings and ensure unintended devices are ignored.
- Disable sleep and power-saving behavior that could interrupt network or USB devices.
