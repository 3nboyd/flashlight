import { ipcMain, shell } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { spawn } from 'child_process'
import ffmpegStatic from 'ffmpeg-static'
import { ffmpegRemuxArgs, type RemuxQuality } from '@core/recording/ffmpegArgs'

/**
 * Recording file I/O + FFmpeg remux. The renderer captures the program visual
 * (and optionally audio) with MediaRecorder - which on Chromium means WebM - and
 * hands us the bytes. For MP4/MOV output we transcode to H.264/AAC with FFmpeg
 * (bundled via ffmpeg-static, falling back to a system ffmpeg on PATH).
 */

/** Resolve a usable ffmpeg binary: the bundled static build, else system. */
function ffmpegBinary(): string {
  const p = (ffmpegStatic as unknown as string) || 'ffmpeg'
  // Packaged, ffmpeg-static reports a path inside app.asar, but the executable
  // is unpacked next to it (see asarUnpack in electron-builder.yml). In dev the
  // path has no "app.asar", so this replace is a harmless no-op.
  return p.replace('app.asar', 'app.asar.unpacked')
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBinary(), args, { windowsHide: true })
    let stderr = ''
    proc.stderr.on('data', (d) => {
      stderr += String(d)
      if (stderr.length > 8000) stderr = stderr.slice(-8000)
    })
    proc.on('error', (err) => reject(new Error(`ffmpeg failed to start: ${err.message}`)))
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.split('\n').slice(-4).join(' ')}`))
    })
  })
}

export function registerRecordingHandlers(): void {
  // Write the recorded bytes straight to disk (used for "as recorded" / WebM).
  ipcMain.handle(
    'recording:save',
    async (_e, dir: string, filename: string, data: ArrayBuffer): Promise<string> => {
      const full = join(dir, filename)
      await fs.writeFile(full, Buffer.from(data))
      return full
    }
  )

  // Write the recording, then (for non-WebM outputs) transcode to the container
  // implied by `outName`'s extension. Returns the final path.
  ipcMain.handle(
    'recording:convert',
    async (
      _e,
      dir: string,
      outName: string,
      data: ArrayBuffer,
      quality: RemuxQuality
    ): Promise<string> => {
      const out = join(dir, outName)
      if (outName.toLowerCase().endsWith('.webm')) {
        await fs.writeFile(out, Buffer.from(data))
        return out
      }
      const temp = join(dir, `.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}.webm`)
      await fs.writeFile(temp, Buffer.from(data))
      try {
        await runFfmpeg(ffmpegRemuxArgs(temp, out, quality))
        return out
      } finally {
        await fs.rm(temp, { force: true }).catch(() => undefined)
      }
    }
  )

  ipcMain.handle('recording:reveal', (_e, path: string): boolean => {
    shell.showItemInFolder(path)
    return true
  })
}
