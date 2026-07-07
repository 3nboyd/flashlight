/** Converts a native filesystem path to the file:// URI form rekordbox.xml's Location attribute expects. */
export function pathToFileUri(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`
  const encoded = withLeadingSlash
    .split('/')
    .map((segment) => (/^[A-Za-z]:$/.test(segment) ? segment : encodeURIComponent(segment)))
    .join('/')
  return `file://localhost${encoded}`
}

export function fileUriToPath(uri: string): string {
  const withoutScheme = uri.replace(/^file:\/\/localhost/, '').replace(/^file:\/\//, '')
  const decoded = withoutScheme
    .split('/')
    .map((segment) => decodeURIComponent(segment))
    .join('/')
  // Windows drive-letter paths look like /C:/Music/... after decoding; strip the leading slash.
  return /^\/[A-Za-z]:\//.test(decoded) ? decoded.slice(1) : decoded
}
