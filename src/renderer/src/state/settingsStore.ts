import { create } from 'zustand'
import type { AppSettings } from '@core/settings/types'
import { ACCENT_COLORS, DEFAULT_SETTINGS } from '@core/settings/types'
import { deriveAccentShades } from '../utils/color'

interface SettingsState {
  settings: AppSettings
  loaded: boolean
  load: () => Promise<void>
  update: (partial: Partial<AppSettings>) => Promise<void>
}

function applyAccentToDocument(settings: AppSettings): void {
  const hex = settings.accent === 'custom' ? settings.customAccentHex : ACCENT_COLORS[settings.accent]
  const shades = deriveAccentShades(hex)
  const root = document.documentElement.style
  root.setProperty('--accent', shades.accent)
  root.setProperty('--accent-hover', shades.accentHover)
  root.setProperty('--accent-active', shades.accentActive)
  root.setProperty('--accent-muted', shades.accentMuted)
  root.setProperty('--accent-text', shades.accentText)
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  load: async () => {
    const settings = await window.djCompanion.settings.get()
    applyAccentToDocument(settings)
    set({ settings, loaded: true })
  },
  update: async (partial) => {
    const next = { ...get().settings, ...partial }
    applyAccentToDocument(next)
    set({ settings: next })
    await window.djCompanion.settings.set(next)
  }
}))
