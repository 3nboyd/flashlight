import { useEffect, useMemo, useRef, type JSX } from 'react'
import type { Scene, SceneTarget, EffectType, Rgbw } from '@core/lighting/engine/types'
import type { FixtureKind } from '@core/lighting/fixtures/types'
import { fixturesById } from '@core/lighting/fixtures/library'
import { useLightingStore } from '../../state/lightingStore'
import { StageVisualizer } from './StageVisualizer'
import { FixtureIcon, KIND_LABELS } from './FixtureIcons'
import { EFFECT_CATALOG, EffectIcon } from './EffectIcons'

/**
 * Full-screen scene editor. The live stage renders on the left with the
 * edited scene auto-previewing, so every change is visible instantly —
 * program the whole show with no lights connected. Targets are cards on
 * the right: pick fixtures from an icon grid (types you've actually
 * patched, plus your groups), choose effects from animated cards, edit
 * palettes as swatches, and shape intensity/speed/size with sliders.
 */

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

/** Beats slider works in musical steps rather than a raw number. */
const BEAT_STEPS = [1, 2, 4, 8, 16, 32]

interface SceneEditorModalProps {
  scene: Scene
  onChange: (scene: Scene) => void
  onClose: () => void
}

export function SceneEditorModal({ scene, onChange, onClose }: SceneEditorModalProps): JSX.Element {
  const { project, triggerScene, status } = useLightingStore()
  const previousSceneRef = useRef<string | null>(status?.activeSceneId ?? null)

  // Auto-preview: the edited scene plays while the editor is open and the
  // previous look is restored on close.
  useEffect(() => {
    const previous = previousSceneRef.current === scene.id ? null : previousSceneRef.current
    triggerScene(scene.id)
    return () => {
      triggerScene(previous)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Only offer fixture types that are actually patched (plus 'all'/groups).
  const patchedKinds = useMemo(() => {
    const defs = fixturesById(project.customFixtures)
    const kinds = new Set<FixtureKind>()
    for (const patch of project.patches) {
      const kind = defs.get(patch.definitionId)?.kind
      if (kind) kinds.add(kind)
    }
    return [...kinds]
  }, [project.patches, project.customFixtures])

  const groups = useMemo(
    () => [...new Set(project.patches.map((p) => p.group).filter((g): g is string => !!g))],
    [project.patches]
  )

  function updateTarget(index: number, partial: Partial<SceneTarget>): void {
    onChange({
      ...scene,
      targets: scene.targets.map((t, i) => (i === index ? { ...t, ...partial } : t))
    })
  }

  function setEffect(index: number, type: EffectType): void {
    const target = scene.targets[index]
    if (type === 'static') {
      updateTarget(index, { effect: undefined })
      return
    }
    updateTarget(index, {
      effect: { beats: 4, ...target.effect, type }
    })
  }

  return (
    <div className="scene-modal-backdrop" onClick={onClose}>
      <div className="scene-modal" onClick={(e) => e.stopPropagation()}>
        <div className="scene-modal-stage">
          <div className="scene-modal-stage-header">
            <span className="settings-hint" style={{ margin: 0 }}>
              Live preview — every change shows here instantly
            </span>
          </div>
          <StageVisualizer height={Math.min(440, window.innerHeight - 320)} />
        </div>

        <div className="scene-modal-editor">
          <div className="scene-modal-header">
            <input
              className="inline-input scene-title-input"
              value={scene.name}
              onChange={(e) => onChange({ ...scene, name: e.target.value })}
            />
            <label className="scene-modal-padcolor" title="Pad color in Perform">
              <input
                type="color"
                value={scene.uiColor}
                onChange={(e) => onChange({ ...scene, uiColor: e.target.value })}
              />
            </label>
            <label className="perform-check" title="HOLD pads fire while pressed and restore the previous look on release">
              <input
                type="checkbox"
                checked={scene.momentary ?? false}
                onChange={(e) => onChange({ ...scene, momentary: e.target.checked || undefined })}
              />
              HOLD
            </label>
            <button className="primary-button" onClick={onClose}>
              Done
            </button>
          </div>

          <div className="scene-modal-scroll">
            {scene.targets.map((target, index) => {
              const effectType: EffectType = target.effect?.type ?? 'static'
              const effectInfo = EFFECT_CATALOG.find((e) => e.type === effectType)!
              const palette =
                target.effect?.colors && target.effect.colors.length > 0
                  ? target.effect.colors
                  : [target.color]
              const beats = target.effect?.beats ?? 4
              const usesMovement = effectInfo.isMovement

              return (
                <div key={index} className="target-card">
                  <div className="target-card-head">
                    <span className="target-card-title">Layer {index + 1}</span>
                    {scene.targets.length > 1 && (
                      <button
                        className="text-button danger"
                        onClick={() =>
                          onChange({ ...scene, targets: scene.targets.filter((_, i) => i !== index) })
                        }
                      >
                        Remove layer
                      </button>
                    )}
                  </div>

                  {/* WHO: fixture picker as icon grid */}
                  <div className="picker-label">Fixtures</div>
                  <div className="fixture-picker">
                    <button
                      className={`fixture-chip${target.group === 'all' ? ' selected' : ''}`}
                      onClick={() => updateTarget(index, { group: 'all' })}
                    >
                      <span className="fixture-chip-all">✦</span>
                      <span>All</span>
                    </button>
                    {patchedKinds.map((kind) => (
                      <button
                        key={kind}
                        className={`fixture-chip${target.group === `kind:${kind}` ? ' selected' : ''}`}
                        onClick={() => updateTarget(index, { group: `kind:${kind}` })}
                      >
                        <FixtureIcon kind={kind} size={22} />
                        <span>{KIND_LABELS[kind]}</span>
                      </button>
                    ))}
                    {groups.map((group) => (
                      <button
                        key={group}
                        className={`fixture-chip${target.group === group ? ' selected' : ''}`}
                        onClick={() => updateTarget(index, { group })}
                      >
                        <span className="fixture-chip-group">#</span>
                        <span>{group}</span>
                      </button>
                    ))}
                  </div>

                  {/* WHAT: effect picker as animated cards */}
                  <div className="picker-label">Effect</div>
                  <div className="effect-picker">
                    {EFFECT_CATALOG.map((info) => (
                      <button
                        key={info.type}
                        className={`effect-card${effectType === info.type ? ' selected' : ''}`}
                        title={info.hint}
                        onClick={() => setEffect(index, info.type)}
                      >
                        <EffectIcon type={info.type} />
                        <span>{info.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* COLOR: palette swatches */}
                  <div className="picker-label">
                    {effectInfo.usesPalette ? 'Colors (cycled by the effect)' : 'Color'}
                  </div>
                  <div className="palette-row">
                    {(effectInfo.usesPalette ? palette : [target.color]).map((color, colorIndex) => (
                      <span key={colorIndex} className="palette-swatch">
                        <input
                          type="color"
                          value={rgbwToHex(color)}
                          onChange={(e) => {
                            const next = hexToRgbw(e.target.value)
                            if (!effectInfo.usesPalette || colorIndex === 0) {
                              updateTarget(index, { color: colorIndex === 0 ? next : target.color })
                            }
                            if (effectInfo.usesPalette && target.effect) {
                              const colors = [...palette]
                              colors[colorIndex] = next
                              updateTarget(index, {
                                color: colorIndex === 0 ? next : target.color,
                                effect: { ...target.effect, colors }
                              })
                            }
                          }}
                        />
                        {effectInfo.usesPalette && palette.length > 1 && (
                          <button
                            className="palette-remove"
                            onClick={() => {
                              if (!target.effect) return
                              const colors = palette.filter((_, i) => i !== colorIndex)
                              updateTarget(index, { effect: { ...target.effect, colors } })
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </span>
                    ))}
                    {effectInfo.usesPalette && palette.length < 6 && (
                      <button
                        className="palette-add"
                        title="Add color"
                        onClick={() => {
                          if (!target.effect) return
                          updateTarget(index, {
                            effect: { ...target.effect, colors: [...palette, { r: 255, g: 255, b: 255 }] }
                          })
                        }}
                      >
                        +
                      </button>
                    )}
                  </div>

                  {/* HOW MUCH: sliders */}
                  <div className="slider-row">
                    <label>Intensity</label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(target.dimmer * 100)}
                      onChange={(e) => updateTarget(index, { dimmer: Number(e.target.value) / 100 })}
                    />
                    <span className="slider-value">{Math.round(target.dimmer * 100)}%</span>
                  </div>

                  {effectType !== 'static' && !['audioLevel', 'bassPulse', 'sparkle', 'strobe'].includes(effectType) && (
                    <div className="slider-row">
                      <label>Speed</label>
                      <input
                        type="range"
                        min={0}
                        max={BEAT_STEPS.length - 1}
                        value={Math.max(0, BEAT_STEPS.findIndex((b) => b >= beats))}
                        onChange={(e) =>
                          target.effect &&
                          updateTarget(index, {
                            effect: { ...target.effect, beats: BEAT_STEPS[Number(e.target.value)] }
                          })
                        }
                      />
                      <span className="slider-value">
                        {beats} beat{beats === 1 ? '' : 's'}
                      </span>
                    </div>
                  )}

                  {usesMovement && (
                    <>
                      <div className="slider-row">
                        <label>Size</label>
                        <input
                          type="range"
                          min={5}
                          max={100}
                          value={Math.round((target.effect?.amplitude ?? 0.5) * 100)}
                          onChange={(e) =>
                            target.effect &&
                            updateTarget(index, {
                              effect: { ...target.effect, amplitude: Number(e.target.value) / 100 }
                            })
                          }
                        />
                        <span className="slider-value">
                          {Math.round((target.effect?.amplitude ?? 0.5) * 100)}%
                        </span>
                      </div>
                      <div className="slider-row">
                        <label>Home position</label>
                        <input
                          type="range"
                          min={0}
                          max={255}
                          title="Pan center"
                          value={target.pan ?? 128}
                          onChange={(e) => updateTarget(index, { pan: Number(e.target.value) })}
                        />
                        <input
                          type="range"
                          min={0}
                          max={255}
                          title="Tilt center"
                          value={target.tilt ?? 128}
                          onChange={(e) => updateTarget(index, { tilt: Number(e.target.value) })}
                        />
                      </div>
                    </>
                  )}
                </div>
              )
            })}

            <button
              className="secondary-button add-layer-button"
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
              + Add layer (target another set of fixtures)
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
