import { ipcMain, shell } from 'electron'
import { promises as fs, createWriteStream, type WriteStream } from 'fs'
import { join, dirname, basename } from 'path'
import { spawn } from 'child_process'
import ffmpegStatic from 'ffmpeg-static'
import { ffmpegRemuxArgs, type RemuxQuality } from '@core/recording/ffmpegArgs'

/**
 * Recording file I/O. The renderer captures the program visual (and optionally
 * audio) with MediaRecorder and STREAMS each ~1s chunk here, where we append it
 * straight to a file on disk. This bounds renderer memory (nothing is held in
 * RAM) and means a crash only ever loses the last moment - critical for long,
 * multi-hour sets. WebM chunks concatenate into one valid file; MP4 output is a
 * separate FFmpeg transcode done AFTER the set, never during it.
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

/** Open disk write streams, keyed by id, that the renderer appends chunks to. */
const streams = new Map<number, { ws: WriteStream; path: string }>()
let streamSeq = 0

/** A non-clashing path: adds " (2)", " (3)"… if the name is already taken. */
async function uniquePath(dir: string, filename: string): Promise<string> {
  const dot = filename.lastIndexOf('.')
  const stem = dot > 0 ? filename.slice(0, dot) : filename
  const ext = dot > 0 ? filename.slice(dot) : ''
  let candidate = join(dir, filename)
  for (let n = 2; ; n++) {
    try {
      await fs.access(candidate)
      candidate = join(dir, `${stem} (${n})${ext}`)
    } catch {
      return candidate
    }
  }
}

export function registerRecordingHandlers(): void {
  // Open a file and return a stream id; the renderer writes chunks to it live.
  ipcMain.handle(
    'recording:openStream',
    async (_e, dir: string, filename: string): Promise<{ id: number; path: string }> => {
      await fs.mkdir(dir, { recursive: true }).catch(() => undefined)
      const path = await uniquePath(dir, filename)
      const ws = createWriteStream(path)
      const id = ++streamSeq
      streams.set(id, { ws, path })
      return { id, path }
    }
  )

  // Append one recorded chunk to its stream (bounded memory - never buffered up).
  ipcMain.handle('recording:writeChunk', (_e, id: number, data: ArrayBuffer): boolean => {
    const s = streams.get(id)
    if (!s) return false
    s.ws.write(Buffer.from(data))
    return true
  })

  // Finish and flush the file; returns its path.
  ipcMain.handle('recording:closeStream', async (_e, id: number): Promise<string | null> => {
    const s = streams.get(id)
    if (!s) return null
    await new Promise<void>((resolve) => s.ws.end(() => resolve()))
    streams.delete(id)
    return s.path
  })

  // Transcode a finished recording FILE to the container implied by outName's
  // extension (MP4/MOV via H.264/AAC). This also cleanly re-muxes a WebM whose
  // header was never finalized (e.g. after a crash), so it doubles as a repair.
  ipcMain.handle(
    'recording:convertFile',
    async (_e, inPath: string, outName: string, quality: RemuxQuality): Promise<string> => {
      const out = await uniquePath(dirname(inPath), outName)
      await runFfmpeg(ffmpegRemuxArgs(inPath, out, quality))
      return out
    }
  )

  // Re-mux a recording into a clean copy in the same container (fixes a file
  // that wasn't closed properly, e.g. after a crash - WebM or MP4).
  ipcMain.handle('recording:repair', async (_e, inPath: string): Promise<string> => {
    const stem = basename(inPath).replace(/\.[^.]+$/, '')
    const ext = (inPath.match(/\.[^.]+$/)?.[0] ?? '.webm').toLowerCase()
    const out = await uniquePath(dirname(inPath), `${stem}-fixed${ext}`)
    const args = ['-y', '-fflags', '+genpts', '-i', inPath, '-c', 'copy']
    if (ext === '.mp4' || ext === '.mov') args.push('-movflags', '+faststart')
    args.push(out)
    await runFfmpeg(args)
    return out
  })

  ipcMain.handle('recording:reveal', (_e, path: string): boolean => {
    shell.showItemInFolder(path)
    return true
  })
}

/** Close any dangling streams on quit so their files are flushed. */
export function disposeRecording(): void {
  for (const { ws } of streams.values()) ws.end()
  streams.clear()
}
