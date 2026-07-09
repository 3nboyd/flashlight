import { readFile, writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { renderTick } from '@core/lighting/engine/LightingEngine'
import { BeatClock } from '@core/lighting/engine/BeatClock'
import {
  defaultLightingProject,
  DEFAULT_OVERRIDES,
  type LightingProject,
  type LiveOverrides,
  type Scene
} from '@core/lighting/engine/types'
import { PRESET_SCENES } from '@core/lighting/engine/presetScenes'
import { builtinFixturesById } from '@core/lighting/fixtures/library'
import type { PatchedFixture } from '@core/lighting/fixtures/types'
import type { AudioFeatures } from '@core/lighting/audio/features'
import { SILENT_FEATURES } from '@core/lighting/audio/features'
import { BpmEstimator } from '@core/lighting/audio/BeatDetector'
import { DmxSender } from './DmxSender'

export interface LightingStatus {
  running: boolean
  activeSceneId: string | null
  bpm: number
  beatPhase: number
  barIndex: number
  autopilotEnabled: boolean
  overrides: LiveOverrides
  outputError: string | null
  audioActive: boolean
}

/**
 * Main-process owner of the whole lighting runtime: holds the project
 * (patches/scenes/pads/output config), the beat clock, live overrides, and
 * the 25ms render→send loop. The renderer talks to this through a thin IPC
 * layer; audio features stream in from the renderer's analyzer.
 */
export class LightingHost {
  private project: LightingProject = defaultLightingProject()
  private readonly clock = new BeatClock()
  private overrides: LiveOverrides = { ...DEFAULT_OVERRIDES }
  private activeSceneId: string | null = null
  private audio: AudioFeatures = SILENT_FEATURES
  private lastAudioAtMs = 0
  private readonly bpmEstimator = new BpmEstimator(40)
  private bpmFollowsAudio = true
  private sender: DmxSender
  private timer: NodeJS.Timeout | null = null
  private readonly projectPath: string

  constructor(userDataDir: string) {
    this.projectPath = join(userDataDir, 'lighting-project.json')
    this.sender = new DmxSender({ protocol: 'artnet', artnetHost: '255.255.255.255' })
  }

  async load(): Promise<LightingProject> {
    try {
      const raw = await readFile(this.projectPath, 'utf-8')
      this.project = { ...defaultLightingProject(), ...JSON.parse(raw) }
    } catch {
      this.project = defaultLightingProject()
      this.project.scenes = [...PRESET_SCENES]
      this.project.padSceneIds = [
        ...PRESET_SCENES.map((s) => s.id),
        ...new Array(16 - PRESET_SCENES.length).fill(null)
      ]
    }
    this.sender.reconfigure({
      protocol: this.project.output.protocol,
      artnetHost: this.project.output.artnetHost
    })
    return this.project
  }

  async saveProject(project: LightingProject): Promise<LightingProject> {
    this.project = project
    this.sender.reconfigure({
      protocol: project.output.protocol,
      artnetHost: project.output.artnetHost
    })
    await mkdir(dirname(this.projectPath), { recursive: true })
    await writeFile(this.projectPath, JSON.stringify(project, null, 2), 'utf-8')
    return project
  }

  getProject(): LightingProject {
    return this.project
  }

  start(): void {
    if (this.timer) return
    const intervalMs = Math.round(1000 / this.project.output.fps)
    this.timer = setInterval(() => this.tick(), intervalMs)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    // Send one final blackout frame so fixtures don't freeze mid-look.
    this.sendBlackoutFrame()
  }

  private sendBlackoutFrame(): void {
    const universes = new Set(this.project.patches.map((p) => p.universe))
    for (const universe of universes) {
      this.sender.sendUniverse(universe, Buffer.alloc(512))
    }
  }

  private resolveFixtures(): PatchedFixture[] {
    const defs = builtinFixturesById()
    return this.project.patches
      .map((patch) => {
        const definition = defs.get(patch.definitionId)
        return definition ? { patch, definition } : null
      })
      .filter((f): f is PatchedFixture => f !== null)
  }

  private currentScene(nowMs: number): Scene | null {
    if (this.project.autopilot.enabled) {
      const rotation =
        this.project.autopilot.sceneIds.length > 0
          ? this.project.autopilot.sceneIds
          : this.project.scenes.map((s) => s.id)
      if (rotation.length > 0) {
        const bars = Math.max(1, this.project.autopilot.barsPerScene)
        const slot = Math.floor(this.clock.positionAt(nowMs).barIndex / bars) % rotation.length
        const scene = this.project.scenes.find((s) => s.id === rotation[slot])
        if (scene) return scene
      }
    }
    return this.project.scenes.find((s) => s.id === this.activeSceneId) ?? null
  }

  private tick(): void {
    const nowMs = Date.now()
    const audioFresh = nowMs - this.lastAudioAtMs < 500
    const universes = renderTick({
      fixtures: this.resolveFixtures(),
      scene: this.currentScene(nowMs),
      overrides: this.overrides,
      beat: this.clock.positionAt(nowMs),
      audio: audioFresh ? this.audio : SILENT_FEATURES,
      nowMs
    })
    for (const [universe, data] of universes) {
      this.sender.sendUniverse(universe, data.toBuffer())
    }
  }

  // ---- control surface (called from IPC) ----

  triggerScene(sceneId: string | null): void {
    this.activeSceneId = sceneId
  }

  setOverrides(partial: Partial<LiveOverrides>): LiveOverrides {
    this.overrides = { ...this.overrides, ...partial }
    return this.overrides
  }

  tapTempo(): number {
    this.clock.tap(Date.now())
    this.bpmFollowsAudio = false
    return this.clock.getBpm()
  }

  setBpm(bpm: number): number {
    this.clock.setBpm(bpm, Date.now())
    this.bpmFollowsAudio = false
    return this.clock.getBpm()
  }

  resyncDownbeat(): void {
    this.clock.resyncDownbeat(Date.now())
  }

  setBpmFollowsAudio(follow: boolean): void {
    this.bpmFollowsAudio = follow
  }

  updateAudioFeatures(features: AudioFeatures & { flux?: number }): void {
    this.audio = features
    this.lastAudioAtMs = Date.now()
    if (typeof features.flux === 'number') {
      this.bpmEstimator.addFrame(features.flux)
      if (this.bpmFollowsAudio) {
        const bpm = this.bpmEstimator.estimate()
        if (bpm !== null && Math.abs(bpm - this.clock.getBpm()) > 1) {
          this.clock.setBpm(bpm, Date.now())
        }
        if (features.onset) {
          this.clock.nudgeTowardOnset(Date.now())
        }
      }
    }
  }

  getStatus(): LightingStatus {
    const nowMs = Date.now()
    const position = this.clock.positionAt(nowMs)
    return {
      running: this.timer !== null,
      activeSceneId: this.currentScene(nowMs)?.id ?? null,
      bpm: this.clock.getBpm(),
      beatPhase: position.beatPhase,
      barIndex: position.barIndex,
      autopilotEnabled: this.project.autopilot.enabled,
      overrides: this.overrides,
      outputError: this.senderError(),
      audioActive: nowMs - this.lastAudioAtMs < 500
    }
  }

  private senderError(): string | null {
    return this.sender.getLastError()
  }

  dispose(): void {
    this.stop()
    this.sender.close()
  }
}
