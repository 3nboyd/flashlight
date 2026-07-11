/** Minimal cross-platform path helpers for the renderer (no Node "path" module in the browser context). */

export function baseName(path: string): string {
  const normalized = path.replace(/[/\\]+$/, '')
  const segments = normalized.split(/[/\\]/)
  return segments[segments.length - 1] ?? path
}

export function dirName(path: string): string {
  const normalized = path.replace(/[/\\]+$/, '')
  const lastSlash = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  if (lastSlash <= 0) return normalized.slice(0, lastSlash + 1) || normalized
  return normalized.slice(0, lastSlash)
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}
