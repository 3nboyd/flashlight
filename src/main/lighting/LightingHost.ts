import { readFile, writeFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { networkInterfaces } from 'os'
import { renderTick } from '@core/lighting/engine/LightingEngine'
import type { Universe } from '@core/lighting/dmx/Universe'
import { BeatClock } from '@core/lighting/engine/BeatClock'
import {
  defaultLightingProject,
  DEFAULT_OVERRIDES,
  type LightingProject,
  type LiveOverrides,
  type Scene
} from '@core/lighting/engine/types'
import { PRESET_SCENES, PRESET_CATEGORY_BY_ID, defaultSmartPools } from '@core/lighting/engine/presetScenes'
import { SmartModeEngine, type SmartPhase } from '@core/lighting/engine/SmartMode'
import { fixturesById } from '@core/lighting/fixtures/library'
import type { PatchedFixture } from '@core/lighting/fixtures/types'
import type { AudioFeatures } from '@core/lighting/audio/features'
import { SILENT_FEATURES } from '@core/lighting/audio/features'
import { BpmEstimator } from '@core/lighting/audio/BeatDetector'
import { DmxSender } from './DmxSender'
import { Os2lServer, type DiscoveryMode } from './Os2lServer'
import { ArtNetDiscovery, type DiscoveredNode } from './ArtNetDiscovery'

export type BeatSource = 'os2l' | 'audio' | 'manual'

/** Snapshot of the output path for the Setup diagnostics panel. */
export interface OutputDiagnostics {
  protocol: 'artnet' | 'sacn' | 'enttec'
  /** Where frames are going (IP for Art-Net, multicast note for sACN, serial path for USB). */
  target: string
  /** True while the render/send loop is running. */
  running: boolean
  /** Monotonic frames sent since launch (renderer derives a rate from deltas). */
  packetsSent: number
  /** Wall-clock ms of the last frame sent, or 0 if none yet. */
  lastSendMs: number
  lastError: string | null
  /** This machine's non-loopback IPv4 addresses, for subnet-matching a node. */
  interfaces: { name: string; address: string }[]
}

/** Full-on white on every fixture channel, used by the Identify test. */
const IDENTIFY_SCENE: Scene = {
  id: '__identify',
  name: 'Identify',
  uiColor: '#ffffff',
  targets: [{ group: 'all', color: { r: 255, g: 255, b: 255, w: 255 }, dimmer: 1 }]
}

function localIpv4Interfaces(): { name: string; address: string }[] {
  const out: { name: string; address: string }[] = []
  for (const [name, infos] of Object.entries(networkInterfaces())) {
    for (const info of infos ?? []) {
      if (info.family === 'IPv4' && !info.internal) out.push({ name, address: info.address })
    }
  }
  return out
}

/** Grows/shrinks the pad-scene array to exactly `count`, preserving assignments. */
export function resizePads(pads: (string | null)[], count: number): (string | null)[] {
  const next = pads.slice(0, count)
  while (next.length < count) next.push(null)
  return next
}

/** Vivid, well-separated colors the manual trigger steps through. */
const MANUAL_PALETTE: { r: number; g: number; b: number }[] = [
  { r: 255, g: 0, b: 0 },
  { r: 0, g: 100, b: 255 },
  { r: 0, g: 255, b: 60 },
  { r: 255, g: 0, b: 200 },
  { r: 255, g: 160, b: 0 },
  { r: 150, g: 0, b: 255 },
  { r: 0, g: 230, b: 255 },
  { r: 255, g: 255, b: 255 }
]

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
  smartEnabled: boolean
  smartPhase: SmartPhase
  smartBuildProgress: number
  /** Manual trigger currently overriding color/movement. */
  manualActive: boolean
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
  private readonly legacyProjectPath: string
  private readonly stagesDir: string
  private stageIndex: { activeId: string; stages: { id: string; name: string }[] } = {
    activeId: '',
    stages: []
  }
  private os2l: Os2lServer | null = null
  private os2lConnected = false
  private lastOs2lBeatAtMs = 0
  private readonly smart = new SmartModeEngine(40)
  private smartEnabled = false
  private smartIntensity = 1
  private smartPhase: SmartPhase = 'steady'
  private smartBuildProgress = 0
  // Manual trigger pad: each tap cycles a color and jumps movers, so the DJ
  // can drive changes by hand (following the melody), then clear to revert.
  private manualIndex = 0
  private manualColor: { r: number; g: number; b: number } | null = null
  private manualPan = 0
  private manualTilt = 0
  private readonly discovery = new ArtNetDiscovery()
  // Identify test: force one fixture full-on so a DJ can trace the signal
  // chain to a specific light. Auto-clears so it never gets left on.
  private identifyId: string | null = null
  private identifyTimer: NodeJS.Timeout | null = null

  constructor(userDataDir: string) {
    this.legacyProjectPath = join(userDataDir, 'lighting-project.json')
    this.stagesDir = join(userDataDir, 'lighting-stages')
    this.sender = new DmxSender({
      protocol: 'artnet',
      artnetHost: '255.255.255.255',
      serialPath: null
    })
  }

  // ---- stage management (multiple saved rigs/shows) ----

  private stagePath(id: string): string {
    return join(this.stagesDir, `${id}.json`)
  }

  private async readStageIndex(): Promise<void> {
    try {
      this.stageIndex = JSON.parse(await readFile(join(this.stagesDir, 'index.json'), 'utf-8'))
    } catch {
      this.stageIndex = { activeId: '', stages: [] }
    }
  }

  private async writeStageIndex(): Promise<void> {
    await mkdir(this.stagesDir, { recursive: true })
    await writeFile(join(this.stagesDir, 'index.json'), JSON.stringify(this.stageIndex, null, 2), 'utf-8')
  }

  listStages(): { id: string; name: string; active: boolean }[] {
    return this.stageIndex.stages.map((s) => ({ ...s, active: s.id === this.stageIndex.activeId }))
  }

  private freshProject(): LightingProject {
    const project = defaultLightingProject()
    project.scenes = [...PRESET_SCENES]
    const padIds = PRESET_SCENES.map((s) => s.id).slice(0, 16)
    project.padSceneIds = [...padIds, ...new Array(Math.max(0, 16 - padIds.length)).fill(null)]
    const pools = defaultSmartPools(project.scenes.map((s) => s.id))
    project.smart.pools = pools
    // Autopilot defaults to the calm/flow looks (main + chill), never the
    // peak/strobe/blinder scenes, so out of the box it stays tasteful.
    project.autopilot.sceneIds = [...pools.main, ...pools.chill]
    return project
  }

  private normalizeProject(parsed: Partial<LightingProject>): LightingProject {
    const defaults = defaultLightingProject()
    const project = {
      ...defaults,
      ...parsed,
      output: { ...defaults.output, ...parsed.output },
      os2l: { ...defaults.os2l, ...parsed.os2l },
      audio: { ...defaults.audio, ...parsed.audio },
      smart: { ...defaults.smart, ...parsed.smart },
      stageProps: parsed.stageProps ?? defaults.stageProps,
      padCount: parsed.padCount ?? 16,
      sceneViewMode: parsed.sceneViewMode ?? 'grid'
    } as LightingProject
    // Keep the pad array sized to padCount (older stages saved 16).
    project.padSceneIds = resizePads(project.padSceneIds ?? [], project.padCount)
    // Backfill scene categories for stages saved before the four-bucket split,
    // so recognized preset scenes still group in the browser and pickers.
    project.scenes = project.scenes.map((scene) =>
      scene.category ? scene : { ...scene, category: PRESET_CATEGORY_BY_ID[scene.id] }
    )
    return project
  }

  async load(): Promise<LightingProject> {
    await this.readStageIndex()

    if (this.stageIndex.stages.length === 0) {
      // First run (or migration from the single-project era).
      let initial: LightingProject
      try {
        initial = this.normalizeProject(JSON.parse(await readFile(this.legacyProjectPath, 'utf-8')))
      } catch {
        initial = this.freshProject()
      }
      const id = `stage-${Date.now()}`
      this.stageIndex = { activeId: id, stages: [{ id, name: 'My Stage' }] }
      this.project = initial
      await this.writeStageIndex()
      await writeFile(this.stagePath(id), JSON.stringify(initial, null, 2), 'utf-8')
    } else {
      try {
        this.project = this.normalizeProject(
          JSON.parse(await readFile(this.stagePath(this.stageIndex.activeId), 'utf-8'))
        )
      } catch {
        this.project = this.freshProject()
      }
    }
    this.applyIntegrationConfig()
    return this.project
  }

  async saveProject(project: LightingProject): Promise<LightingProject> {
    this.project = project
    this.applyIntegrationConfig()
    await mkdir(this.stagesDir, { recursive: true })
    await writeFile(this.stagePath(this.stageIndex.activeId), JSON.stringify(project, null, 2), 'utf-8')
    return project
  }

  /** Save the current rig under a new name and make it the active stage. */
  async saveStageAs(name: string): Promise<LightingProject> {
    const id = `stage-${Date.now()}`
    this.stageIndex.stages.push({ id, name })
    this.stageIndex.activeId = id
    await this.writeStageIndex()
    return this.saveProject(structuredClone(this.project))
  }

  /** Create a fresh stage (default rig + presets) and switch to it. */
  async newStage(name: string): Promise<LightingProject> {
    const id = `stage-${Date.now()}`
    this.stageIndex.stages.push({ id, name })
    this.stageIndex.activeId = id
    await this.writeStageIndex()
    this.triggerScene(null)
    return this.saveProject(this.freshProject())
  }

  async switchStage(id: string): Promise<LightingProject> {
    if (!this.stageIndex.stages.some((s) => s.id === id)) return this.project
    this.stageIndex.activeId = id
    await this.writeStageIndex()
    try {
      this.project = this.normalizeProject(JSON.parse(await readFile(this.stagePath(id), 'utf-8')))
    } catch {
      this.project = this.freshProject()
    }
    this.triggerScene(null) // scene ids differ between stages
    this.applyIntegrationConfig()
    return this.project
  }

  async renameStage(id: string, name: string): Promise<void> {
    const stage = this.stageIndex.stages.find((s) => s.id === id)
    if (stage && name.trim()) {
      stage.name = name.trim()
      await this.writeStageIndex()
    }
  }

  async deleteStage(id: string): Promise<LightingProject> {
    if (this.stageIndex.stages.length <= 1) return this.project // always keep one
    this.stageIndex.stages = this.stageIndex.stages.filter((s) => s.id !== id)
    await rm(this.stagePath(id), { force: true })
    if (this.stageIndex.activeId === id) {
      return this.switchStage(this.stageIndex.stages[0].id)
    }
    await this.writeStageIndex()
    return this.project
  }

  private applyIntegrationConfig(): void {
    // Classify each scene for texture-aware smart picks: scenes built on
    // audio/beat-driven effects read as 'reactive'; color/movement flows
    // read as 'flow'.
    const reactiveEffects = new Set([
      'bassPulse',
      'audioLevel',
      'beatPulse',
      'sparkle',
      'strobe',
      'eighthStrobe',
      'eighthBuild',
      'rainbowStep'
    ])
    const sceneCharacter: Record<string, 'reactive' | 'flow'> = {}
    for (const scene of this.project.scenes) {
      sceneCharacter[scene.id] = scene.targets.some(
        (t) => t.effect && reactiveEffects.has(t.effect.type)
      )
        ? 'reactive'
        : 'flow'
    }
    this.smart.updateConfig({ ...this.project.smart, sceneCharacter })
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
    const defs = fixturesById(this.project.customFixtures)
    return this.project.patches
      .map((patch) => {
        const definition = defs.get(patch.definitionId)
        return definition ? { patch, definition } : null
      })
      .filter((f): f is PatchedFixture => f !== null)
  }

  private currentScene(nowMs: number): Scene | null {
    // Smart mode owns scene selection while enabled (it sets activeSceneId
    // directly), so autopilot rotation is suspended.
    if (this.project.autopilot.enabled && !this.smartEnabled) {
      const rotation =
        this.project.autopilot.sceneIds.length > 0
          ? this.project.autopilot.sceneIds
          : this.project.scenes.map((s) => s.id)
      if (rotation.length > 0) {
        const bars = Math.max(1, this.project.autopilot.barsPerScene)
        const step = Math.floor(this.clock.positionAt(nowMs).barIndex / bars)
        // Shuffle: deterministic hash of the step, so the "random" order is
        // stable within a step but non-sequential across steps.
        const slot = this.project.autopilot.shuffle
          ? Math.abs((step * 2654435761) % 2 ** 31) % rotation.length
          : step % rotation.length
        const scene = this.project.scenes.find((s) => s.id === rotation[slot])
        if (scene) return scene
      }
    }
    return this.project.scenes.find((s) => s.id === this.activeSceneId) ?? null
  }

  /**
   * The live overrides actually sent to the engine: the user's knobs/faders,
   * plus the manual-trigger color+movement, plus Smart Mode's intensity
   * shaping.
   */
  private effectiveOverrides(): LiveOverrides {
    let o = this.overrides
    if (this.manualColor) {
      o = {
        ...o,
        colorOverride: o.colorOverride ?? this.manualColor,
        panOffset: Math.max(-1, Math.min(1, o.panOffset + this.manualPan)),
        tiltOffset: Math.max(-1, Math.min(1, o.tiltOffset + this.manualTilt))
      }
    }
    if (this.smartEnabled && this.smartIntensity < 1) {
      o = { ...o, masterDimmer: o.masterDimmer * this.smartIntensity }
    }
    return o
  }

  /**
   * Overwrites the identified fixture's channels with a full-on white look,
   * layered on top of whatever the scene produced, so it stands out on stage
   * for the Identify test.
   */
  private applyIdentify(universes: Map<number, Universe>, nowMs: number): void {
    if (!this.identifyId) return
    const fixture = this.resolveFixtures().find((f) => f.patch.id === this.identifyId)
    if (!fixture) return
    const dst = universes.get(fixture.patch.universe)
    if (!dst) return
    const src = renderTick({
      fixtures: [fixture],
      scene: IDENTIFY_SCENE,
      beat: this.clock.positionAt(nowMs),
      nowMs
    }).get(fixture.patch.universe)
    if (!src) return
    for (let i = 0; i < fixture.definition.channels.length; i++) {
      const address = fixture.patch.address + i
      dst.setChannel(address, src.getChannel(address))
    }
  }

  private tick(): void {
    const nowMs = Date.now()
    const audioFresh = nowMs - this.lastAudioAtMs < 500
    const universes = renderTick({
      fixtures: this.resolveFixtures(),
      scene: this.currentScene(nowMs),
      overrides: this.effectiveOverrides(),
      beat: this.clock.positionAt(nowMs),
      audio: audioFresh ? this.audio : SILENT_FEATURES,
      nowMs
    })
    this.applyIdentify(universes, nowMs)
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
   * Renders the current look on demand for the stage visualizer - computed
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
      overrides: this.effectiveOverrides(),
      beat: this.clock.positionAt(nowMs),
      audio: audioFresh ? this.audio : SILENT_FEATURES,
      nowMs
    })
    this.applyIdentify(universes, nowMs)
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

  /**
   * Manual trigger: each call advances to the next vivid color and jumps
   * every moving fixture to a fresh position. Driven by the DJ's own taps
   * so the show can follow the melody, not just the beat grid.
   */
  manualPulse(): void {
    this.manualIndex += 1
    this.manualColor = MANUAL_PALETTE[this.manualIndex % MANUAL_PALETTE.length]
    const hash = (salt: number): number => {
      const v = Math.abs(Math.sin(this.manualIndex * 12.9898 + salt)) * 43758.5453
      return (v - Math.floor(v)) * 1.6 - 0.8 // -0.8..0.8
    }
    this.manualPan = hash(1)
    this.manualTilt = hash(7)
  }

  /** Release manual trigger and return to the automatic look. */
  clearManual(): void {
    this.manualIndex = 0
    this.manualColor = null
    this.manualPan = 0
    this.manualTilt = 0
  }

  isManualActive(): boolean {
    return this.manualColor !== null
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

  setSmartMode(enabled: boolean): void {
    this.smartEnabled = enabled
    if (enabled) {
      this.smart.updateConfig(this.project.smart)
      this.smart.reset()
      this.smartIntensity = 1
      this.smartPhase = 'steady'
      this.smartBuildProgress = 0
    } else {
      this.smartIntensity = 1
    }
  }

  updateAudioFeatures(features: AudioFeatures & { flux?: number }): void {
    this.audio = features
    this.lastAudioAtMs = Date.now()

    if (this.smartEnabled) {
      const decision = this.smart.addFrame(features, this.clock.positionAt(Date.now()))
      this.smartPhase = decision.phase
      this.smartIntensity = decision.intensity
      this.smartBuildProgress = decision.buildProgress
      if (decision.sceneId && this.project.scenes.some((s) => s.id === decision.sceneId)) {
        this.activeSceneId = decision.sceneId
      }
    }
    if (typeof features.flux === 'number') {
      this.bpmEstimator.addFrame(features.flux)
      // Audio-derived tempo only steers the clock when OS2L isn't - the DJ
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
      os2lDiscovery: this.os2l?.getDiscoveryMode() ?? 'off',
      smartEnabled: this.smartEnabled,
      smartPhase: this.smartPhase,
      smartBuildProgress: this.smartBuildProgress,
      manualActive: this.manualColor !== null
    }
  }

  private senderError(): string | null {
    return this.sender.getLastError()
  }

  // ---- output diagnostics (Setup panel) ----

  /** Live output-path status for the diagnostics panel. */
  getOutputDiagnostics(): OutputDiagnostics {
    const { packetsSent, lastSendMs } = this.sender.getSendStats()
    const output = this.project.output
    const target =
      output.protocol === 'artnet'
        ? output.artnetHost
        : output.protocol === 'sacn'
          ? 'sACN multicast (auto)'
          : (output.serialPath ?? 'no serial port selected')
    return {
      protocol: output.protocol,
      target,
      running: this.timer !== null,
      packetsSent,
      lastSendMs,
      lastError: this.senderError(),
      interfaces: localIpv4Interfaces()
    }
  }

  /** One-shot Art-Net node discovery: broadcast a poll, gather the replies. */
  scanArtNet(): Promise<DiscoveredNode[]> {
    return this.discovery.scan('255.255.255.255')
  }

  /** Force one fixture full-on (or clear with null) to trace the signal chain. */
  identifyFixture(patchId: string | null): void {
    if (this.identifyTimer) {
      clearTimeout(this.identifyTimer)
      this.identifyTimer = null
    }
    this.identifyId = patchId
    if (patchId) {
      this.identifyTimer = setTimeout(() => {
        this.identifyId = null
        this.identifyTimer = null
      }, 30000)
    }
  }

  getIdentifyId(): string | null {
    return this.identifyId
  }

  dispose(): void {
    this.stop()
    if (this.identifyTimer) {
      clearTimeout(this.identifyTimer)
      this.identifyTimer = null
    }
    this.discovery.close()
    this.os2l?.stop()
    this.os2l = null
    this.sender.close()
  }
}
