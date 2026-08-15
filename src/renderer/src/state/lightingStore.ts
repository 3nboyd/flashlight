import { create } from 'zustand'
import type { LightingProject, LiveOverrides, Scene } from '@core/lighting/engine/types'
import { defaultLightingProject, DEFAULT_OVERRIDES } from '@core/lighting/engine/types'
import { emptyMidiMapping, midiMappingHasBindings } from '@core/lighting/midi/midiMapping'
import type { LightingStatus } from '../../../main/lighting/LightingHost'
import { midiPads } from '../views/lighting/runtime'

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

    // MIDI mapping lives in the project (durable, on disk). On first run after
    // this change, migrate any legacy localStorage mapping into it so the user's
    // existing controller layout is not lost.
    let midi = project.midi
    if (!midiMappingHasBindings(midi)) {
      const legacy = midiPads.getMapping()
      if (midiMappingHasBindings(legacy)) midi = legacy
    }
    midi = midi ?? emptyMidiMapping()
    midiPads.setMapping(midi)
    const withMidi = { ...project, midi }
    set({ project: withMidi, status, loaded: true, overrides: status.overrides })
    if (JSON.stringify(project.midi ?? {}) !== JSON.stringify(midi)) {
      await window.djCompanion.lighting.saveProject(withMidi)
    }
    // Any later binding change (learn/unbind in Setup) persists into the project.
    midiPads.setOnChange((m) => {
      void get().updateProject((p) => ({ ...p, midi: m }))
    })
  },

  /** Adopt a project returned by stage switch/new/save-as IPC calls. */
  applyLoadedProject: (project) => {
    // Use this stage's saved MIDI if it has one; otherwise (older stage) carry
    // over the current controller mapping and adopt it into the stage, so
    // switching stages never silently wipes the mapping.
    if (midiMappingHasBindings(project.midi)) {
      midiPads.setMapping(project.midi!)
      set({ project })
    } else {
      const current = midiPads.getMapping()
      const withMidi = { ...project, midi: current }
      midiPads.setMapping(current)
      set({ project: withMidi })
      void window.djCompanion.lighting.saveProject(withMidi)
    }
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
    const { project, overrides } = get()
    const status = await window.djCompanion.lighting.triggerScene(sceneId)
    set({ status })
    // When the user has opted out of persistent blackout, picking a scene
    // clears blackout like switching to any other look.
    if (sceneId && project.blackoutHolds === false && overrides.blackout) {
      const next = await window.djCompanion.lighting.setOverrides({ blackout: false })
      set({ overrides: next })
    }
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
