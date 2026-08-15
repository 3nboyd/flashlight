import { ipcMain, shell } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'

/**
 * Recording file I/O. The renderer captures the visual (and optionally audio)
 * with MediaRecorder and hands us the encoded bytes; we write them to the
 * folder the user chose. Muxing to other containers (FFmpeg) can layer on later.
 */
export function registerRecordingHandlers(): void {
  ipcMain.handle(
    'recording:save',
    async (_e, dir: string, filename: string, data: ArrayBuffer): Promise<string> => {
      const full = join(dir, filename)
      await fs.writeFile(full, Buffer.from(data))
      return full
    }
  )

  ipcMain.handle('recording:reveal', (_e, path: string): boolean => {
    shell.showItemInFolder(path)
    return true
  })
}
