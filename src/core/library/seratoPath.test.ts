import { describe, it, expect } from 'vitest'
import { toSeratoPath, fromSeratoPath } from './seratoPath'

describe('seratoPath', () => {
  it('strips the leading slash for macOS/Linux absolute paths', () => {
    expect(toSeratoPath('/Users/dj/Music/track.mp3', 'darwin')).toBe('Users/dj/Music/track.mp3')
  })

  it('restores the leading slash when converting back on macOS/Linux', () => {
    expect(fromSeratoPath('Users/dj/Music/track.mp3', 'darwin')).toBe('/Users/dj/Music/track.mp3')
  })

  it('converts backslashes to forward slashes for Windows, keeping the drive letter', () => {
    expect(toSeratoPath('C:\\Users\\dj\\Music\\track.mp3', 'win32')).toBe('C:/Users/dj/Music/track.mp3')
  })

  it('restores backslashes when converting back on Windows', () => {
    expect(fromSeratoPath('C:/Users/dj/Music/track.mp3', 'win32')).toBe('C:\\Users\\dj\\Music\\track.mp3')
  })

  it('round-trips on both platforms', () => {
    expect(fromSeratoPath(toSeratoPath('/Users/dj/Music/t.mp3', 'darwin'), 'darwin')).toBe(
      '/Users/dj/Music/t.mp3'
    )
    expect(fromSeratoPath(toSeratoPath('C:\\Music\\t.mp3', 'win32'), 'win32')).toBe('C:\\Music\\t.mp3')
  })
})
