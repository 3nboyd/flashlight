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
import type { LightingStatus } from '../main/lighting/LightingHost'

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
    tapTempo: (): Promise<number> => ipcRenderer.invoke('lighting:tapTempo'),
    setBpm: (bpm: number): Promise<number> => ipcRenderer.invoke('lighting:setBpm', bpm),
    resyncDownbeat: (): Promise<void> => ipcRenderer.invoke('lighting:resyncDownbeat'),
    setBpmFollowsAudio: (follow: boolean): Promise<void> =>
      ipcRenderer.invoke('lighting:setBpmFollowsAudio', follow),
    getStatus: (): Promise<LightingStatus> => ipcRenderer.invoke('lighting:getStatus'),
    sendAudioFeatures: (features: AudioFeatures & { flux?: number }): void =>
      ipcRenderer.send('lighting:audioFeatures', features)
  }
}

export type DjCompanionApi = typeof api

contextBridge.exposeInMainWorld('djCompanion', api)
