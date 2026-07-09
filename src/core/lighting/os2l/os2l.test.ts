import { describe, it, expect } from 'vitest'
import { Os2lStreamParser } from './protocol'
import { encodeEnttecProDmx } from '../dmx/enttec'

describe('Os2lStreamParser', () => {
  it('parses a single beat event', () => {
    const parser = new Os2lStreamParser()
    const events = parser.feed('{"evt":"beat","change":false,"pos":42,"bpm":120.0}')
    expect(events).toEqual([{ evt: 'beat', change: false, pos: 42, bpm: 120, strength: undefined }])
  })

  it('parses multiple concatenated objects with no delimiter (real TCP behavior)', () => {
    const parser = new Os2lStreamParser()
    const events = parser.feed(
      '{"evt":"beat","change":true,"pos":0,"bpm":128}{"evt":"beat","change":false,"pos":1,"bpm":128}'
    )
    expect(events).toHaveLength(2)
    expect(events[1]).toMatchObject({ pos: 1 })
  })

  it('handles an object split across two TCP chunks', () => {
    const parser = new Os2lStreamParser()
    expect(parser.feed('{"evt":"beat","cha')).toEqual([])
    const events = parser.feed('nge":false,"pos":7,"bpm":174.2,"strength":0.9}')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ evt: 'beat', pos: 7, bpm: 174.2, strength: 0.9 })
  })

  it('parses btn and cmd events', () => {
    const parser = new Os2lStreamParser()
    const events = parser.feed(
      '{"evt":"btn","name":"drop","state":"on"}{"evt":"cmd","id":3,"param":0.5}'
    )
    expect(events).toEqual([
      { evt: 'btn', name: 'drop', state: 'on' },
      { evt: 'cmd', id: 3, param: 0.5 }
    ])
  })

  it('ignores unknown events, malformed JSON, and braces inside strings', () => {
    const parser = new Os2lStreamParser()
    const events = parser.feed(
      '{"evt":"unknown"}{bad json}{"evt":"btn","name":"a{b}c","state":"off"}'
    )
    expect(events).toEqual([{ evt: 'btn', name: 'a{b}c', state: 'off' }])
  })

  it('survives interleaved whitespace/newlines between objects', () => {
    const parser = new Os2lStreamParser()
    const events = parser.feed('\n {"evt":"beat","change":false,"pos":1,"bpm":100}\r\n')
    expect(events).toHaveLength(1)
  })
})

describe('encodeEnttecProDmx', () => {
  it('produces a byte-exact frame for a full 512-slot universe', () => {
    const data = Buffer.alloc(512)
    data[0] = 0xaa
    data[511] = 0xbb
    const frame = encodeEnttecProDmx(data)

    expect(frame.length).toBe(5 + 513)
    expect(frame[0]).toBe(0x7e) // start delimiter
    expect(frame[1]).toBe(6) // output DMX label
    expect(frame[2] | (frame[3] << 8)).toBe(513) // length = start code + 512 slots
    expect(frame[4]).toBe(0x00) // DMX start code
    expect(frame[5]).toBe(0xaa) // channel 1
    expect(frame[5 + 511]).toBe(0xbb) // channel 512
    expect(frame[frame.length - 1]).toBe(0xe7) // end delimiter
  })

  it('rejects empty or oversized payloads', () => {
    expect(() => encodeEnttecProDmx(Buffer.alloc(0))).toThrow(RangeError)
    expect(() => encodeEnttecProDmx(Buffer.alloc(513))).toThrow(RangeError)
  })
})
