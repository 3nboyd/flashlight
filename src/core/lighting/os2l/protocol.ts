/**
 * OS2L (Open Sound to Light, os2l.org) message layer. The DMX software (us)
 * runs a TCP server advertised over DNS-SD as "_os2l._tcp"; the audio
 * software (VirtualDJ etc.) connects and streams short JSON messages.
 *
 * Key message — beat:
 *   {"evt":"beat","change":false,"pos":42,"bpm":120.0,"strength":0.8}
 * `pos` is a running beat counter aligned so pos % 4 == 0 on measure
 * boundaries and pos % 32 == 0 on 8-bar phrase boundaries — which lets our
 * bar/phrase-locked effects line up exactly with the DJ software's grid.
 *
 * Messages arrive as concatenated JSON objects over TCP with no guaranteed
 * delimiter, so Os2lStreamParser splits the byte stream on top-level brace
 * boundaries (string-aware) rather than assuming newlines.
 */

export interface Os2lBeatEvent {
  evt: 'beat'
  change: boolean
  pos: number
  bpm: number
  strength?: number
}

export interface Os2lButtonEvent {
  evt: 'btn'
  name: string
  state: 'on' | 'off'
}

export interface Os2lCmdEvent {
  evt: 'cmd'
  id: number
  param: number
}

export type Os2lEvent = Os2lBeatEvent | Os2lButtonEvent | Os2lCmdEvent

function toEvent(raw: unknown): Os2lEvent | null {
  if (typeof raw !== 'object' || raw === null || !('evt' in raw)) return null
  const obj = raw as Record<string, unknown>
  switch (obj.evt) {
    case 'beat': {
      if (typeof obj.bpm !== 'number' || typeof obj.pos !== 'number') return null
      return {
        evt: 'beat',
        change: obj.change === true,
        pos: obj.pos,
        bpm: obj.bpm,
        strength: typeof obj.strength === 'number' ? obj.strength : undefined
      }
    }
    case 'btn': {
      if (typeof obj.name !== 'string') return null
      return { evt: 'btn', name: obj.name, state: obj.state === 'off' ? 'off' : 'on' }
    }
    case 'cmd': {
      if (typeof obj.id !== 'number') return null
      return { evt: 'cmd', id: obj.id, param: typeof obj.param === 'number' ? obj.param : 0 }
    }
    default:
      return null
  }
}

export class Os2lStreamParser {
  private buffer = ''
  private depth = 0
  private inString = false
  private escaped = false
  private objectStart = -1

  /** Feed raw TCP bytes; returns every complete, recognized event found. */
  feed(chunk: string | Buffer): Os2lEvent[] {
    const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
    const events: Os2lEvent[] = []
    this.buffer += text

    let i = this.buffer.length - text.length
    // Re-scan only the new region; state carries across feeds.
    for (; i < this.buffer.length; i++) {
      const ch = this.buffer[i]
      if (this.inString) {
        if (this.escaped) this.escaped = false
        else if (ch === '\\') this.escaped = true
        else if (ch === '"') this.inString = false
        continue
      }
      if (ch === '"') {
        this.inString = true
      } else if (ch === '{') {
        if (this.depth === 0) this.objectStart = i
        this.depth += 1
      } else if (ch === '}') {
        this.depth -= 1
        if (this.depth === 0 && this.objectStart >= 0) {
          const candidate = this.buffer.slice(this.objectStart, i + 1)
          try {
            const event = toEvent(JSON.parse(candidate))
            if (event) events.push(event)
          } catch {
            // Malformed object: drop it and keep scanning.
          }
          this.objectStart = -1
        } else if (this.depth < 0) {
          this.depth = 0 // stray brace — resynchronize
        }
      }
    }

    // Trim consumed bytes, keeping any partial object.
    if (this.depth === 0 && this.objectStart === -1) {
      this.buffer = ''
    } else if (this.objectStart > 0) {
      this.buffer = this.buffer.slice(this.objectStart)
      this.objectStart = 0
    }
    return events
  }
}
