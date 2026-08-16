import { describe, it, expect } from 'vitest'
import { ffmpegRemuxArgs } from './ffmpegArgs'

describe('ffmpegRemuxArgs', () => {
  it('reads the input and writes the output last', () => {
    const args = ffmpegRemuxArgs('/in/take.webm', '/out/take.mp4', 'balanced')
    expect(args[args.indexOf('-i') + 1]).toBe('/in/take.webm')
    expect(args[args.length - 1]).toBe('/out/take.mp4')
  })

  it('transcodes to H.264 + AAC with faststart', () => {
    const args = ffmpegRemuxArgs('a.webm', 'a.mp4', 'balanced')
    expect(args).toContain('libx264')
    expect(args).toContain('aac')
    expect(args.join(' ')).toContain('-movflags +faststart')
    expect(args).toContain('yuv420p')
  })

  it('maps quality to CRF (lower = higher quality)', () => {
    const crf = (q: 'high' | 'balanced' | 'small'): number =>
      Number(ffmpegRemuxArgs('a', 'b', q)[ffmpegRemuxArgs('a', 'b', q).indexOf('-crf') + 1])
    expect(crf('high')).toBeLessThan(crf('balanced'))
    expect(crf('balanced')).toBeLessThan(crf('small'))
  })

  it('always overwrites (-y) so a re-record does not hang on a prompt', () => {
    expect(ffmpegRemuxArgs('a.webm', 'a.mov', 'high')).toContain('-y')
  })
})
