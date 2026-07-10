import { create } from 'zustand'
import type { LightingProject, LiveOverrides, Scene } from '@core/lighting/engine/types'
import { defaultLightingProject, DEFAULT_OVERRIDES } from '@core/lighting/engine/types'
import type { LightingStatus } from '../../../main/lighting/LightingHost'

interface LightingState {
  project: LightingProject
  status: LightingStatus | null
  loaded: boolean
  load: () => Promise<void>
  /** Adopt a project loaded by stage operations (switch/new/save-as). */
  applyLoadedProject: (project: LightingProject) => void
  /** Replace + persist the project. */
  updateProject: (mutate: (project: LightingProject) => LightingProject) => Promise<void>
  refreshStatus: () => Promise<void>
  startEngine: () => Promise<void>
  stopEngine: () => Promise<void>
  triggerScene: (sceneId: string | null) => Promise<void>
  setOverrides: (partial: Partial<LiveOverrides>) => Promise<void>
  overrides: LiveOverrides
}

export const useLightingStore = create<LightingState>((set, get) => ({
  project: defaultLightingProject(),
  status: null,
  loaded: false,
  overrides: { ...DEFAULT_OVERRIDES },

  load: async () => {
    const project = await window.djCompanion.lighting.loadProject()
    const status = await window.djCompanion.lighting.getStatus()
    set({ project, status, loaded: true, overrides: status.overrides })
  },

  /** Adopt a project returned by stage switch/new/save-as IPC calls. */
  applyLoadedProject: (project) => {
    set({ project })
  },

  updateProject: async (mutate) => {
    const next = mutate(get().project)
    set({ project: next })
    await window.djCompanion.lighting.saveProject(next)
  },

  refreshStatus: async () => {
    const status = await window.djCompanion.lighting.getStatus()
    set({ status })
  },

  startEngine: async () => {
    const status = await window.djCompanion.lighting.start()
    set({ status })
  },

  stopEngine: async () => {
    const status = await window.djCompanion.lighting.stop()
    set({ status })
  },

  triggerScene: async (sceneId) => {
    const status = await window.djCompanion.lighting.triggerScene(sceneId)
    set({ status })
  },

  setOverrides: async (partial) => {
    const overrides = await window.djCompanion.lighting.setOverrides(partial)
    set({ overrides })
  }
}))

export function sceneById(project: LightingProject, id: string | null): Scene | null {
  if (!id) return null
  return project.scenes.find((s) => s.id === id) ?? null
}
