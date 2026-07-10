import { useState, type JSX } from 'react'
import type { ChannelRole, ChannelSpec, FixtureDefinition, FixtureKind } from '@core/lighting/fixtures/types'

/**
 * Builds a fixture profile from a DMX channel chart: one row per channel,
 * pick what each channel does. Covers any fixture whose manual lists its
 * channel assignments — which is all of them.
 */

const KIND_OPTIONS: { value: FixtureKind; label: string }[] = [
  { value: 'par', label: 'Par / Wash' },
  { value: 'bar', label: 'LED Bar (color segments)' },
  { value: 'movingHead', label: 'Moving Head' },
  { value: 'movingBar', label: 'Moving Bar (multi-head, per-head tilt)' },
  { value: 'strobe', label: 'Strobe' },
  { value: 'derby', label: 'Derby / Moonflower' },
  { value: 'scanner', label: 'Scanner' },
  { value: 'laser', label: 'Laser' },
  { value: 'uv', label: 'UV / Blacklight' },
  { value: 'fog', label: 'Fog machine' },
  { value: 'dimmer', label: 'Dimmer' },
  { value: 'other', label: 'Other' }
]

const ROLE_OPTIONS: { value: ChannelRole; label: string; hint?: string }[] = [
  { value: 'dimmer', label: 'Dimmer (master intensity)' },
  { value: 'red', label: 'Red' },
  { value: 'green', label: 'Green' },
  { value: 'blue', label: 'Blue' },
  { value: 'white', label: 'White' },
  { value: 'amber', label: 'Amber' },
  { value: 'uv', label: 'UV' },
  { value: 'strobe', label: 'Strobe rate' },
  { value: 'pan', label: 'Pan' },
  { value: 'tilt', label: 'Tilt' },
  { value: 'panFine', label: 'Pan fine' },
  { value: 'tiltFine', label: 'Tilt fine' },
  { value: 'colorWheel', label: 'Color wheel' },
  { value: 'gobo', label: 'Gobo / Pattern' },
  { value: 'onOff', label: 'On/Off (lit with scene)', hint: 'e.g. laser enable' },
  { value: 'speed', label: 'Speed (fixed value)' },
  { value: 'mode', label: 'Mode (fixed value)' },
  { value: 'static', label: 'Other (fixed value)' }
]

const SEGMENTABLE: ChannelRole[] = ['red', 'green', 'blue', 'white', 'amber', 'dimmer', 'tilt', 'pan']
const FIXED_VALUE: ChannelRole[] = ['speed', 'mode', 'static']

interface CustomFixtureEditorProps {
  existing: FixtureDefinition | null
  onSave: (definition: FixtureDefinition) => void
  onCancel: () => void
}

export function CustomFixtureEditor({ existing, onSave, onCancel }: CustomFixtureEditorProps): JSX.Element {
  const [name, setName] = useState(existing?.name ?? '')
  const [kind, setKind] = useState<FixtureKind>(existing?.kind ?? 'par')
  const [channels, setChannels] = useState<ChannelSpec[]>(
    existing?.channels.map((c) => ({ ...c })) ?? [{ role: 'dimmer' }, { role: 'red' }, { role: 'green' }, { role: 'blue' }]
  )

  function updateChannel(index: number, partial: Partial<ChannelSpec>): void {
    setChannels((prev) => prev.map((c, i) => (i === index ? { ...c, ...partial } : c)))
  }

  const usesSegments = kind === 'bar' || kind === 'movingBar'

  function save(): void {
    if (!name.trim() || channels.length === 0) return
    const definition: FixtureDefinition = {
      id: existing?.id ?? `custom-${Date.now()}`,
      name: name.trim(),
      kind,
      channels: channels.map((c) => {
        const spec: ChannelSpec = { role: c.role }
        if (usesSegments && c.segment !== undefined && SEGMENTABLE.includes(c.role)) {
          spec.segment = c.segment
        }
        if (FIXED_VALUE.includes(c.role)) spec.staticValue = c.staticValue ?? 0
        if (c.role === 'onOff') spec.onValue = c.onValue ?? 255
        if (c.role === 'strobe') {
          spec.strobeOpen = 0
          spec.strobeRange = { min: 16, max: 255 }
        }
        return spec
      })
    }
    onSave(definition)
  }

  return (
    <div className="scene-editor custom-fixture-editor">
      <div className="scene-editor-header">
        <input
          className="inline-input scene-title-input"
          placeholder="Fixture name (e.g. MyBrand Hex Par 12ch)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select value={kind} onChange={(e) => setKind(e.target.value as FixtureKind)}>
          {KIND_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button className="secondary-button" onClick={onCancel}>
          Cancel
        </button>
        <button className="primary-button" onClick={save} disabled={!name.trim()}>
          Save Profile
        </button>
      </div>

      <p className="settings-hint">
        One row per DMX channel, in order, straight from the fixture manual&rsquo;s channel chart.
        {usesSegments &&
          ' For multi-head fixtures, set the head number on each per-head channel (colors, tilt).'}
      </p>

      <table className="library-table channel-table">
        <thead>
          <tr>
            <th>Ch</th>
            <th>Function</th>
            {usesSegments && <th>Head #</th>}
            <th>Value</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {channels.map((channel, index) => (
            <tr key={index}>
              <td>{index + 1}</td>
              <td>
                <select
                  value={channel.role}
                  onChange={(e) => updateChannel(index, { role: e.target.value as ChannelRole })}
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </td>
              {usesSegments && (
                <td>
                  {SEGMENTABLE.includes(channel.role) ? (
                    <input
                      className="inline-input narrow"
                      type="number"
                      min={1}
                      max={32}
                      placeholder="—"
                      value={channel.segment !== undefined ? channel.segment + 1 : ''}
                      onChange={(e) =>
                        updateChannel(index, {
                          segment: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) - 1)
                        })
                      }
                    />
                  ) : (
                    '—'
                  )}
                </td>
              )}
              <td>
                {FIXED_VALUE.includes(channel.role) ? (
                  <input
                    className="inline-input narrow"
                    type="number"
                    min={0}
                    max={255}
                    value={channel.staticValue ?? 0}
                    onChange={(e) => updateChannel(index, { staticValue: Number(e.target.value) })}
                  />
                ) : channel.role === 'onOff' ? (
                  <input
                    className="inline-input narrow"
                    type="number"
                    min={1}
                    max={255}
                    title="Value written while lit"
                    value={channel.onValue ?? 255}
                    onChange={(e) => updateChannel(index, { onValue: Number(e.target.value) })}
                  />
                ) : (
                  '—'
                )}
              </td>
              <td>
                <button
                  className="text-button danger"
                  onClick={() => setChannels((prev) => prev.filter((_, i) => i !== index))}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="setup-row" style={{ marginTop: 8 }}>
        <button
          className="secondary-button"
          onClick={() => setChannels((prev) => [...prev, { role: 'static', staticValue: 0 }])}
        >
          + Add Channel
        </button>
        <span className="settings-hint" style={{ margin: 0 }}>
          {channels.length} channel{channels.length === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  )
}
