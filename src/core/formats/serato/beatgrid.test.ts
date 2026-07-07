import { describe, it, expect } from 'vitest'
import { parseBeatGrid, serializeBeatGrid, type BeatGrid } from './beatgrid'

describe('Serato BeatGrid', () => {
  it('round-trips a multi-marker grid ending in a terminal bpm marker', () => {
    const grid: BeatGrid = {
      markers: [
        { terminal: false, positionSeconds: 0.523, beatsTillNextMarker: 4 },
        { terminal: false, positionSeconds: 2.611, beatsTillNextMarker: 8 },
        { terminal: true, positionSeconds: 6.789, bpm: 128.0 }
      ],
      footer: Buffer.from([0x00])
    }
    const parsed = parseBeatGrid(serializeBeatGrid(grid))
    expect(parsed.markers.length).toBe(3)
    expect(parsed.markers[2]).toEqual({ terminal: true, positionSeconds: expect.closeTo(6.789, 4), bpm: 128 })
    expect(parsed.footer.equals(Buffer.from([0x00]))).toBe(true)
  })

  it('round-trips a single-marker grid', () => {
    const grid: BeatGrid = {
      markers: [{ terminal: true, positionSeconds: 0, bpm: 174.5 }],
      footer: Buffer.alloc(0)
    }
    const parsed = parseBeatGrid(serializeBeatGrid(grid))
    expect(parsed.markers).toHaveLength(1)
    expect((parsed.markers[0] as { bpm: number }).bpm).toBeCloseTo(174.5, 3)
  })

  it('round-trips zero markers', () => {
    const grid: BeatGrid = { markers: [], footer: Buffer.from([0]) }
    const parsed = parseBeatGrid(serializeBeatGrid(grid))
    expect(parsed.markers).toEqual([])
  })
})
