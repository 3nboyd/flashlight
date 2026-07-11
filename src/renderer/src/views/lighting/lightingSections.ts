/**
 * Section registry shared by the sidebar sub-nav and the Setup/Settings
 * panels, so the jump-links and the rendered sections stay in lockstep.
 * "Setup" holds the creative rig/scene work; "Settings" holds the
 * hardware/connection config (audio, DMX, OS2L, MIDI).
 */

export interface SectionDef {
  id: string
  label: string
}

export const SETUP_SECTIONS: SectionDef[] = [
  { id: 'stages', label: 'Stages & Rig' },
  { id: 'fixtures', label: 'Fixtures' },
  { id: 'scenes', label: 'Scenes' },
  { id: 'smart', label: 'Smart Mode' },
  { id: 'autopilot', label: 'Autopilot' },
  { id: 'pads', label: 'Performance Pads' }
]

export const SETTINGS_SECTIONS: SectionDef[] = [
  { id: 'audio', label: 'Audio Input' },
  { id: 'dmx', label: 'DMX Output' },
  { id: 'os2l', label: 'OS2L Link' },
  { id: 'midi', label: 'MIDI Controller' }
]

export const SETUP_SECTION_IDS = new Set(SETUP_SECTIONS.map((s) => s.id))
export const SETTINGS_SECTION_IDS = new Set(SETTINGS_SECTIONS.map((s) => s.id))
