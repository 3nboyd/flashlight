import type { JSX } from 'react'
import type { Scene, SceneTarget, EffectType, Rgbw } from '@core/lighting/engine/types'

const EFFECT_OPTIONS: { value: EffectType; label: string }[] = [
  { value: 'static', label: 'Static' },
  { value: 'beatPulse', label: 'Beat Pulse' },
  { value: 'colorCycle', label: 'Color Cycle' },
  { value: 'chase', label: 'Chase' },
  { value: 'rainbow', label: 'Rainbow' },
  { value: 'strobe', label: 'Strobe' },
  { value: 'audioLevel', label: 'Audio Level' },
  { value: 'bassPulse', label: 'Bass Pulse' },
  { value: 'movementCircle', label: 'Movement: Circle' },
  { value: 'movementSweep', label: 'Movement: Sweep' }
]

function rgbwToHex(color: Rgbw): string {
  const toHex = (v: number): string => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`
}

function hexToRgbw(hex: string): Rgbw {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16)
  }
}

interface SceneEditorProps {
  scene: Scene
  groups: string[]
  onChange: (scene: Scene) => void
  onClose: () => void
}

export function SceneEditor({ scene, groups, onChange, onClose }: SceneEditorProps): JSX.Element {
  function updateTarget(index: number, partial: Partial<SceneTarget>): void {
    const targets = scene.targets.map((t, i) => (i === index ? { ...t, ...partial } : t))
    onChange({ ...scene, targets })
  }

  return (
    <div className="scene-editor">
      <div className="scene-editor-header">
        <input
          className="inline-input scene-title-input"
          value={scene.name}
          onChange={(e) => onChange({ ...scene, name: e.target.value })}
        />
        <label>
          Pad color
          <input
            type="color"
            value={scene.uiColor}
            onChange={(e) => onChange({ ...scene, uiColor: e.target.value })}
          />
        </label>
        <button className="secondary-button" onClick={onClose}>
          Done
        </button>
      </div>

      {scene.targets.map((target, index) => (
        <div key={index} className="target-editor">
          <div className="setup-row">
            <label>Targets</label>
            <select value={target.group} onChange={(e) => updateTarget(index, { group: e.target.value })}>
              <option value="all">All fixtures</option>
              <optgroup label="By type (finds them anywhere)">
                <option value="kind:par">All pars/washes</option>
                <option value="kind:movingHead">All moving heads</option>
                <option value="kind:movingBar">All moving bars</option>
                <option value="kind:bar">All pixel bars</option>
                <option value="kind:strobe">All strobes</option>
                <option value="kind:laser">All lasers</option>
                <option value="kind:derby">All derbies</option>
                <option value="kind:scanner">All scanners</option>
                <option value="kind:uv">All UV</option>
                <option value="kind:fog">All fog machines</option>
              </optgroup>
              {groups.length > 0 && (
                <optgroup label="Your groups">
                  {groups.map((g) => (
                    <option key={g} value={g}>
                      Group: {g}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>

            <label>Color</label>
            <input
              type="color"
              value={rgbwToHex(target.color)}
              onChange={(e) => updateTarget(index, { color: hexToRgbw(e.target.value) })}
            />

            <label>Intensity</label>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(target.dimmer * 100)}
              onChange={(e) => updateTarget(index, { dimmer: Number(e.target.value) / 100 })}
            />
            <span>{Math.round(target.dimmer * 100)}%</span>
          </div>

          <div className="setup-row">
            <label>Effect</label>
            <select
              value={target.effect?.type ?? 'static'}
              onChange={(e) => {
                const type = e.target.value as EffectType
                updateTarget(index, {
                  effect: type === 'static' ? undefined : { ...target.effect, type }
                })
              }}
            >
              {EFFECT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {target.effect && (
              <>
                <label>Beats</label>
                <input
                  type="number"
                  min={1}
                  max={64}
                  value={target.effect.beats ?? 4}
                  onChange={(e) =>
                    updateTarget(index, {
                      effect: { ...target.effect!, beats: Number(e.target.value) || 4 }
                    })
                  }
                />
              </>
            )}

            {(target.effect?.type === 'movementCircle' || target.effect?.type === 'movementSweep') && (
              <>
                <label>Size</label>
                <input
                  type="range"
                  min={5}
                  max={100}
                  value={Math.round((target.effect.amplitude ?? 0.5) * 100)}
                  onChange={(e) =>
                    updateTarget(index, {
                      effect: { ...target.effect!, amplitude: Number(e.target.value) / 100 }
                    })
                  }
                />
              </>
            )}
          </div>

          {scene.targets.length > 1 && (
            <button
              className="text-button danger"
              onClick={() =>
                onChange({ ...scene, targets: scene.targets.filter((_, i) => i !== index) })
              }
            >
              Remove target
            </button>
          )}
        </div>
      ))}

      <button
        className="text-button"
        onClick={() =>
          onChange({
            ...scene,
            targets: [
              ...scene.targets,
              { group: 'all', color: { r: 255, g: 255, b: 255 }, dimmer: 0.8 }
            ]
          })
        }
      >
        + Add target (different group)
      </button>
    </div>
  )
}
