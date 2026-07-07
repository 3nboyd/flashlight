/**
 * Serato's database V2 / crate files store paths relative to a volume root
 * with forward slashes (e.g. "Users/dj/Music/track.mp3" on macOS,
 * "C:/Users/dj/Music/track.mp3" on Windows) rather than absolute OS paths.
 *
 * CONFIDENCE NOTE: verified against community documentation of the path
 * field convention, not against a real Serato-written file from every OS.
 * Every write path goes through BackupManager first, so a wrong assumption
 * here is recoverable rather than destructive.
 */

export type Platform = 'darwin' | 'win32' | 'linux'

export function toSeratoPath(absolutePath: string, platform: Platform): string {
  const forwardSlashed = absolutePath.replace(/\\/g, '/')
  if (platform === 'win32') {
    return forwardSlashed
  }
  return forwardSlashed.startsWith('/') ? forwardSlashed.slice(1) : forwardSlashed
}

export function fromSeratoPath(seratoPath: string, platform: Platform): string {
  if (platform === 'win32') {
    return seratoPath.replace(/\//g, '\\')
  }
  return seratoPath.startsWith('/') ? seratoPath : `/${seratoPath}`
}
