import { ipcMain, app } from 'electron'
import { LightingHost } from '../lighting/LightingHost'
import { DmxSender } from '../lighting/DmxSender'
import type { LightingProject, LiveOverrides } from '@core/lighting/engine/types'
import type { AudioFeatures } from '@core/lighting/audio/features'

let host: LightingHost | null = null

export function getLightingHost(): LightingHost {
  if (!host) {
    host = new LightingHost(app.getPath('userData'))
  }
  return host
}

export function registerLightingHandlers(): void {
  const lighting = getLightingHost()

  ipcMain.handle('lighting:loadProject', async () => lighting.load())
  ipcMain.handle('lighting:saveProject', async (_e, project: LightingProject) =>
    lighting.saveProject(project)
  )
  ipcMain.handle('lighting:start', async () => {
    lighting.start()
    return lighting.getStatus()
  })
  ipcMain.handle('lighting:stop', async () => {
    lighting.stop()
    return lighting.getStatus()
  })
  ipcMain.handle('lighting:triggerScene', async (_e, sceneId: string | null) => {
    lighting.triggerScene(sceneId)
    return lighting.getStatus()
  })
  ipcMain.handle('lighting:setOverrides', async (_e, partial: Partial<LiveOverrides>) =>
    lighting.setOverrides(partial)
  )
  ipcMain.handle('lighting:forceBlackout', async () => {
    lighting.forceBlackout()
    return true
  })
  ipcMain.handle('lighting:tapTempo', async () => lighting.tapTempo())
  ipcMain.handle('lighting:setBpm', async (_e, bpm: number) => lighting.setBpm(bpm))
  ipcMain.handle('lighting:resyncDownbeat', async () => lighting.resyncDownbeat())
  ipcMain.handle('lighting:setBpmFollowsAudio', async (_e, follow: boolean) =>
    lighting.setBpmFollowsAudio(follow)
  )
  ipcMain.handle('lighting:getStatus', async () => lighting.getStatus())
  ipcMain.handle('lighting:listSerialPorts', async () => DmxSender.listSerialPorts())
  ipcMain.handle('lighting:getUniverseSnapshot', async () => lighting.getUniverseSnapshot())
  ipcMain.handle('lighting:setSmartMode', async (_e, enabled: boolean) => {
    lighting.setSmartMode(enabled)
    return lighting.getStatus()
  })
  ipcMain.handle('lighting:listStages', async () => lighting.listStages())
  ipcMain.handle('lighting:saveStageAs', async (_e, name: string) => lighting.saveStageAs(name))
  ipcMain.handle('lighting:newStage', async (_e, name: string) => lighting.newStage(name))
  ipcMain.handle('lighting:switchStage', async (_e, id: string) => lighting.switchStage(id))
  ipcMain.handle('lighting:renameStage', async (_e, id: string, name: string) =>
    lighting.renameStage(id, name)
  )
  ipcMain.handle('lighting:deleteStage', async (_e, id: string) => lighting.deleteStage(id))
  ipcMain.handle('lighting:manualPulse', async () => {
    lighting.manualPulse()
    return lighting.getStatus()
  })
  ipcMain.handle('lighting:clearManual', async () => {
    lighting.clearManual()
    return lighting.getStatus()
  })
  ipcMain.handle('lighting:previewFlowPattern', async (_e, pattern: number) => {
    lighting.previewFlowPattern(pattern)
  })
  ipcMain.handle('lighting:getOutputDiagnostics', async () => lighting.getOutputDiagnostics())
  ipcMain.handle('lighting:scanArtNet', async () => lighting.scanArtNet())
  ipcMain.handle('lighting:autoConnectArtnet', async () => lighting.autoConnectArtnet())
  ipcMain.handle('lighting:identifyFixture', async (_e, patchId: string | null) => {
    lighting.identifyFixture(patchId)
    return lighting.getIdentifyId()
  })

  // High-frequency fire-and-forget stream (no reply needed).
  ipcMain.on('lighting:audioFeatures', (_e, features: AudioFeatures & { flux?: number }) => {
    lighting.updateAudioFeatures(features)
  })
}

export function disposeLighting(): void {
  host?.dispose()
  host = null
}
