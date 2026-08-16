import type { JSX } from 'react'
import { PerformPanel } from '../lighting/PerformPanel'
import { CameraView } from '../camera/CameraView'
import './OperatorView.css'

/**
 * Phase E: the unified "Live" operator surface. One screen combining the
 * lighting perform controls (rig visualizer, pads, master/knobs) and the camera
 * program (auto-director cut + record), so the DJ performs both without changing
 * sections. Each side reuses its full component; the camera side renders in
 * `embedded` mode (grid + auto-switch + record, no setup chrome).
 *
 * Only one app section mounts at a time, so this composition owns the single
 * live instance of the MIDI/audio/camera runtime while it is shown.
 */
export function OperatorView(): JSX.Element {
  return (
    <div className="operator-view">
      <section className="operator-pane operator-pane--lighting">
        <PerformPanel />
      </section>
      <section className="operator-pane operator-pane--camera">
        <CameraView embedded />
      </section>
    </div>
  )
}
