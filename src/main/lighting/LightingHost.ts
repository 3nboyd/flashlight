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
import { Os2lServer, type DiscoveryMode } from './Os2lServer'

export type BeatSource = 'os2l' | 'audio' | 'manual'

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
  /** Which source is currently driving the beat clock. */
  beatSource: BeatSource
  os2lConnected: boolean
  /** ip:port for pointing VirtualDJ manually if discovery fails. */
  os2lAddress: string | null
  os2lError: string | null
  /** How the OS2L service is being advertised for auto-detection. */
  os2lDiscovery: DiscoveryMode
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
  private os2l: Os2lServer | null = null
  private os2lConnected = false
  private lastOs2lBeatAtMs = 0

  constructor(userDataDir: string) {
    this.projectPath = join(userDataDir, 'lighting-project.json')
    this.sender = new DmxSender({
      protocol: 'artnet',
      artnetHost: '255.255.255.255',
      serialPath: null
    })
  }

  async load(): Promise<LightingProject> {
    try {
      const raw = await readFile(this.projectPath, 'utf-8')
      const parsed = JSON.parse(raw)
      const defaults = defaultLightingProject()
      this.project = {
        ...defaults,
        ...parsed,
        output: { ...defaults.output, ...parsed.output },
        os2l: { ...defaults.os2l, ...parsed.os2l }
      }
    } catch {
      this.project = defaultLightingProject()
      this.project.scenes = [...PRESET_SCENES]
      this.project.padSceneIds = [
        ...PRESET_SCENES.map((s) => s.id),
        ...new Array(16 - PRESET_SCENES.length).fill(null)
      ]
    }
    this.applyIntegrationConfig()
    return this.project
  }

  async saveProject(project: LightingProject): Promise<LightingProject> {
    this.project = project
    this.applyIntegrationConfig()
    await mkdir(dirname(this.projectPath), { recursive: true })
    await writeFile(this.projectPath, JSON.stringify(project, null, 2), 'utf-8')
    return project
  }

  private applyIntegrationConfig(): void {
    this.sender.reconfigure({
      protocol: this.project.output.protocol,
      artnetHost: this.project.output.artnetHost,
      serialPath: this.project.output.serialPath
    })

    const wantOs2l = this.project.os2l.enabled
    const portChanged = this.os2l !== null && this.os2l.getPort() !== this.project.os2l.port
    if (this.os2l && (!wantOs2l || portChanged)) {
      this.os2l.stop()
      this.os2l = null
      this.os2lConnected = false
    }
    if (wantOs2l && !this.os2l) {
      this.os2l = new Os2lServer(this.project.os2l.port, {
        onEvent: (event) => {
          if (event.evt === 'beat') {
            this.clock.syncToExternalBeat(event.bpm, event.pos, Date.now())
            this.lastOs2lBeatAtMs = Date.now()
          }
        },
        onConnectionChange: (connected) => {
          this.os2lConnected = connected
        }
      })
      this.os2l.start()
    }
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
      // A USB interface is a single DMX line: emit only its configured universe.
      if (this.project.output.protocol === 'enttec' && universe !== this.project.output.usbUniverse) {
        continue
      }
      this.sender.sendUniverse(universe, data.toBuffer())
    }
  }

  /** OS2L wins while beats are flowing; audio analysis next; tap/manual otherwise. */
  private currentBeatSource(nowMs: number): BeatSource {
    if (this.os2lConnected && nowMs - this.lastOs2lBeatAtMs < 4000) return 'os2l'
    if (this.bpmFollowsAudio && nowMs - this.lastAudioAtMs < 500) return 'audio'
    return 'manual'
  }

  /**
   * Renders the current look on demand for the stage visualizer — computed
   * fresh rather than tapping the output loop, so the preview works
   * identically whether DMX output is running or stopped (programming
   * without lights connected).
   */
  getUniverseSnapshot(): Record<number, number[]> {
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
    const snapshot: Record<number, number[]> = {}
    for (const [universe, data] of universes) {
      snapshot[universe] = Array.from(data.toBuffer())
    }
    return snapshot
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
      // Audio-derived tempo only steers the clock when OS2L isn't — the DJ
      // software's own grid is always more accurate than our estimation.
      if (this.bpmFollowsAudio && this.currentBeatSource(Date.now()) !== 'os2l') {
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
      audioActive: nowMs - this.lastAudioAtMs < 500,
      beatSource: this.currentBeatSource(nowMs),
      os2lConnected: this.os2lConnected,
      os2lAddress: this.os2l?.getAdvertisedAddress() ?? null,
      os2lError: this.os2l?.getLastError() ?? null,
      os2lDiscovery: this.os2l?.getDiscoveryMode() ?? 'off'
    }
  }

  private senderError(): string | null {
    return this.sender.getLastError()
  }

  dispose(): void {
    this.stop()
    this.os2l?.stop()
    this.os2l = null
    this.sender.close()
  }
}
