import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings } from '@core/settings/types'
import type { BackupEntry } from '@core/backup/types'
import type { ScanResult } from '@core/library/LibraryScanner'
import type { DirEntryInfo, FileMoveResult } from '@core/fileops/FileOperations'
import type { LibrarySyncResult } from '@core/fileops/LibrarySync'
import type { RenameCandidateInput, RenamePreview } from '@core/rename/RenameEngine'
import type { RenameApplyItem } from '../main/ipc/rename'
import type { LightingProject, LiveOverrides } from '@core/lighting/engine/types'
import type { AudioFeatures } from '@core/lighting/audio/features'
import type { LightingStatus, OutputDiagnostics } from '../main/lighting/LightingHost'
import type { DiscoveredNode } from '../main/lighting/ArtNetDiscovery'

interface MoveOrRenameResponse {
  result: FileMoveResult
  sync: LibrarySyncResult[]
}

const api = {
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion')
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
    set: (settings: AppSettings): Promise<AppSettings> =>
      ipcRenderer.invoke('settings:set', settings)
  },
  backup: {
    list: (): Promise<BackupEntry[]> => ipcRenderer.invoke('backup:list'),
    prune: (retentionDays: number, maxTotalBytes: number): Promise<BackupEntry[]> =>
      ipcRenderer.invoke('backup:prune', retentionDays, maxTotalBytes),
    restore: (backupId: string): Promise<BackupEntry> =>
      ipcRenderer.invoke('backup:restore', backupId)
  },
  dialog: {
    selectFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:selectFolder'),
    selectFile: (filters?: { name: string; extensions: string[] }[]): Promise<string | null> =>
      ipcRenderer.invoke('dialog:selectFile', filters)
  },
  library: {
    scanFolder: (folderPath: string): Promise<ScanResult> =>
      ipcRenderer.invoke('library:scanFolder', folderPath),
    scanConfiguredFolders: (): Promise<ScanResult> =>
      ipcRenderer.invoke('library:scanConfiguredFolders')
  },
  fileops: {
    list: (dirPath: string): Promise<DirEntryInfo[]> => ipcRenderer.invoke('fileops:list', dirPath),
    move: (fromPath: string, toDir: string): Promise<MoveOrRenameResponse> =>
      ipcRenderer.invoke('fileops:move', fromPath, toDir),
    rename: (entryPath: string, newName: string): Promise<MoveOrRenameResponse> =>
      ipcRenderer.invoke('fileops:rename', entryPath, newName),
    copy: (fromPath: string, toDir: string): Promise<FileMoveResult> =>
      ipcRenderer.invoke('fileops:copy', fromPath, toDir),
    delete: (entryPath: string): Promise<void> => ipcRenderer.invoke('fileops:delete', entryPath),
    createFolder: (parentDir: string, name: string): Promise<string> =>
      ipcRenderer.invoke('fileops:createFolder', parentDir, name),
    moveMany: (
      paths: string[],
      toDir: string
    ): Promise<{ results: FileMoveResult[]; sync: LibrarySyncResult[] }> =>
      ipcRenderer.invoke('fileops:moveMany', paths, toDir),
    copyMany: (paths: string[], toDir: string): Promise<FileMoveResult[]> =>
      ipcRenderer.invoke('fileops:copyMany', paths, toDir)
  },
  rename: {
    preview: (candidates: RenameCandidateInput[], knownArtists: string[]): Promise<RenamePreview[]> =>
      ipcRenderer.invoke('rename:preview', candidates, knownArtists),
    apply: (items: RenameApplyItem[]): Promise<Array<FileMoveResult & { sync: LibrarySyncResult | null }>> =>
      ipcRenderer.invoke('rename:apply', items)
  },
  lighting: {
    loadProject: (): Promise<LightingProject> => ipcRenderer.invoke('lighting:loadProject'),
    saveProject: (project: LightingProject): Promise<LightingProject> =>
      ipcRenderer.invoke('lighting:saveProject', project),
    start: (): Promise<LightingStatus> => ipcRenderer.invoke('lighting:start'),
    stop: (): Promise<LightingStatus> => ipcRenderer.invoke('lighting:stop'),
    triggerScene: (sceneId: string | null): Promise<LightingStatus> =>
      ipcRenderer.invoke('lighting:triggerScene', sceneId),
    setOverrides: (partial: Partial<LiveOverrides>): Promise<LiveOverrides> =>
      ipcRenderer.invoke('lighting:setOverrides', partial),
    /** Panic reset: hammer all-zero DMX (broadcast + host) to clear stuck lights. */
    forceBlackout: (): Promise<boolean> => ipcRenderer.invoke('lighting:forceBlackout'),
    tapTempo: (): Promise<number> => ipcRenderer.invoke('lighting:tapTempo'),
    setBpm: (bpm: number): Promise<number> => ipcRenderer.invoke('lighting:setBpm', bpm),
    resyncDownbeat: (): Promise<void> => ipcRenderer.invoke('lighting:resyncDownbeat'),
    setBpmFollowsAudio: (follow: boolean): Promise<void> =>
      ipcRenderer.invoke('lighting:setBpmFollowsAudio', follow),
    getStatus: (): Promise<LightingStatus> => ipcRenderer.invoke('lighting:getStatus'),
    listSerialPorts: (): Promise<{ path: string; label: string }[]> =>
      ipcRenderer.invoke('lighting:listSerialPorts'),
    getUniverseSnapshot: (): Promise<Record<number, number[]>> =>
      ipcRenderer.invoke('lighting:getUniverseSnapshot'),
    setSmartMode: (enabled: boolean): Promise<LightingStatus> =>
      ipcRenderer.invoke('lighting:setSmartMode', enabled),
    manualPulse: (): Promise<LightingStatus> => ipcRenderer.invoke('lighting:manualPulse'),
    clearManual: (): Promise<LightingStatus> => ipcRenderer.invoke('lighting:clearManual'),
    previewFlowPattern: (pattern: number): Promise<void> =>
      ipcRenderer.invoke('lighting:previewFlowPattern', pattern),
    getOutputDiagnostics: (): Promise<OutputDiagnostics> =>
      ipcRenderer.invoke('lighting:getOutputDiagnostics'),
    scanArtNet: (): Promise<DiscoveredNode[]> => ipcRenderer.invoke('lighting:scanArtNet'),
    identifyFixture: (patchId: string | null): Promise<string | null> =>
      ipcRenderer.invoke('lighting:identifyFixture', patchId),
    listStages: (): Promise<{ id: string; name: string; active: boolean }[]> =>
      ipcRenderer.invoke('lighting:listStages'),
    saveStageAs: (name: string): Promise<LightingProject> =>
      ipcRenderer.invoke('lighting:saveStageAs', name),
    newStage: (name: string): Promise<LightingProject> => ipcRenderer.invoke('lighting:newStage', name),
    switchStage: (id: string): Promise<LightingProject> => ipcRenderer.invoke('lighting:switchStage', id),
    renameStage: (id: string, name: string): Promise<void> =>
      ipcRenderer.invoke('lighting:renameStage', id, name),
    deleteStage: (id: string): Promise<LightingProject> => ipcRenderer.invoke('lighting:deleteStage', id),
    sendAudioFeatures: (features: AudioFeatures & { flux?: number }): void =>
      ipcRenderer.send('lighting:audioFeatures', features)
  },
  output: {
    /** Opens ANOTHER projector/TV output window; resolves to the count now open. */
    open: (): Promise<number> => ipcRenderer.invoke('output:open'),
    /** Closes all output windows; resolves to 0. */
    close: (): Promise<number> => ipcRenderer.invoke('output:close'),
    isOpen: (): Promise<boolean> => ipcRenderer.invoke('output:isOpen'),
    count: (): Promise<number> => ipcRenderer.invoke('output:count')
  },
  monitor: {
    /** Open/close the floating always-on-top recording monitor window. */
    open: (): Promise<boolean> => ipcRenderer.invoke('monitor:open'),
    close: (): Promise<boolean> => ipcRenderer.invoke('monitor:close'),
    isOpen: (): Promise<boolean> => ipcRenderer.invoke('monitor:isOpen'),
    /** Publish recording status (main window) so the monitor can show it. */
    setStatus: (status: { recording: boolean; startedAt: number }): Promise<boolean> =>
      ipcRenderer.invoke('monitor:setStatus', status),
    getStatus: (): Promise<{ recording: boolean; startedAt: number }> =>
      ipcRenderer.invoke('monitor:getStatus'),
    /** Subscribe to recording-status changes (monitor window). */
    onStatus: (cb: (status: { recording: boolean; startedAt: number }) => void): (() => void) => {
      const handler = (_e: unknown, s: { recording: boolean; startedAt: number }): void => cb(s)
      ipcRenderer.on('monitor:status', handler)
      return () => ipcRenderer.removeListener('monitor:status', handler)
    }
  },
  popout: {
    open: (name: string): Promise<boolean> => ipcRenderer.invoke('popout:open', name),
    close: (name: string): Promise<boolean> => ipcRenderer.invoke('popout:close', name),
    isOpen: (name: string): Promise<boolean> => ipcRenderer.invoke('popout:isOpen', name),
    /** Subscribe to pop-out open/close from any window. Returns an unsubscribe. */
    onChanged: (cb: (name: string, open: boolean) => void): (() => void) => {
      const handler = (_e: unknown, p: { name: string; open: boolean }): void => cb(p.name, p.open)
      ipcRenderer.on('popout:changed', handler)
      return () => ipcRenderer.removeListener('popout:changed', handler)
    }
  },
  recording: {
    /** Open a disk file for streaming; returns a stream id + the final path. */
    openStream: (dir: string, filename: string): Promise<{ id: number; path: string }> =>
      ipcRenderer.invoke('recording:openStream', dir, filename),
    /** Append one recorded chunk to a stream (written straight to disk). */
    writeChunk: (id: number, data: ArrayBuffer): Promise<boolean> =>
      ipcRenderer.invoke('recording:writeChunk', id, data),
    /** Flush + close a stream; returns its path. */
    closeStream: (id: number): Promise<string | null> =>
      ipcRenderer.invoke('recording:closeStream', id),
    /** Transcode a finished recording file to MP4/MOV (also repairs a bad WebM). */
    convertFile: (
      inPath: string,
      outName: string,
      quality: 'high' | 'balanced' | 'small'
    ): Promise<string> => ipcRenderer.invoke('recording:convertFile', inPath, outName, quality),
    /** Re-mux a WebM into a clean copy (fixes a file that wasn't closed). */
    repair: (inPath: string): Promise<string> => ipcRenderer.invoke('recording:repair', inPath),
    reveal: (path: string): Promise<boolean> => ipcRenderer.invoke('recording:reveal', path)
  }
}

export type DjCompanionApi = typeof api

contextBridge.exposeInMainWorld('djCompanion', api)
