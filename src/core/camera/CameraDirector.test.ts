import { describe, it, expect } from 'vitest'
import {
  CameraDirector,
  holdBoundsFromAverage,
  type CameraSignal,
  type DirectorContext
} from './CameraDirector'
import type { CameraRole } from './roles'

function sig(id: string, role: CameraRole, over: Partial<CameraSignal> = {}): CameraSignal {
  // Look-to-cut is on by default for every role except the side-mounted laptop.
  return {
    id,
    role,
    present: 0,
    motion: 0,
    facing: 0,
    lookingAtBoard: 0,
    lookSwitch: role !== 'laptop',
    ...over
  }
}
const ctx = (nowMs: number, over: Partial<DirectorContext> = {}): DirectorContext => ({
  nowMs,
  audioLevel: 0,
  surge: 0,
  onBeat: true,
  ...over
})

describe('CameraDirector', () => {
  it('reports no camera when there are no signals', () => {
    const d = new CameraDirector()
    expect(d.update([], ctx(0))).toEqual({ activeId: null, cut: false })
  })

  it('opens on the head-on shot when the DJ faces it', () => {
    const d = new CameraDirector()
    const dec = d.update(
      [sig('head', 'headon', { present: 1, facing: 1 }), sig('crowd', 'crowd')],
      ctx(0)
    )
    expect(dec.activeId).toBe('head')
    expect(dec.cut).toBe(true)
  })

  it('never cuts to the laptop while the DJ looks face-on at it', () => {
    const d = new CameraDirector()
    const cams = [
      sig('head', 'headon', { present: 1, facing: 1 }),
      // Face-on to the laptop: looking at the screen, not the board.
      sig('lap', 'laptop', { present: 1, facing: 1, lookingAtBoard: 0.1 })
    ]
    d.update(cams, ctx(0))
    // Long after the min hold, the laptop must still never be chosen.
    const dec = d.update(cams, ctx(30000))
    expect(dec.activeId).toBe('head')
    // And its score is exactly zero (ineligible).
    expect(d.score(cams[1], ctx(30000))).toBe(0)
  })

  it('cuts to the laptop when the DJ works the board (looking down/away)', () => {
    const d = new CameraDirector()
    // t=0: DJ faces head-on, not touching the board -> opens on head.
    const headFacing = sig('head', 'headon', { present: 1, facing: 1 })
    const lapIdle = sig('lap', 'laptop', { present: 1, facing: 1, lookingAtBoard: 0.1 })
    expect(d.update([headFacing, lapIdle], ctx(0)).activeId).toBe('head')

    // Later the DJ turns to the decks: head-on loses its face, laptop lights up.
    const headTurned = sig('head', 'headon', { present: 1, facing: 0.2 })
    const lapWorking = sig('lap', 'laptop', {
      present: 1,
      facing: 0.2,
      lookingAtBoard: 0.95,
      motion: 0.5
    })
    // Still within min hold at t=1000 -> no cut yet.
    expect(d.update([headTurned, lapWorking], ctx(1000)).activeId).toBe('head')
    // Past min hold -> the working-the-board laptop shot wins.
    const dec = d.update([headTurned, lapWorking], ctx(3000))
    expect(dec.activeId).toBe('lap')
    expect(dec.cut).toBe(true)
  })

  it('holds a shot for at least minHoldMs', () => {
    const d = new CameraDirector({ minHoldMs: 2500 })
    const head = sig('head', 'headon', { present: 1, facing: 0.3 })
    const crowd = sig('crowd', 'crowd')
    d.update([head, crowd], ctx(0)) // opens on head
    // Even with the crowd scoring higher on a drop, no cut before 2.5s.
    const dec = d.update([head, crowd], ctx(1500, { audioLevel: 1, surge: 1 }))
    expect(dec.activeId).toBe('head')
    expect(dec.cut).toBe(false)
  })

  it('forces variety after maxHoldMs even without a clearly better shot', () => {
    const d = new CameraDirector({ minHoldMs: 2000, maxHoldMs: 8000, hysteresis: 5 })
    const head = sig('head', 'headon', { present: 1, facing: 1 })
    const side = sig('side', 'side', { present: 1 })
    d.update([head, side], ctx(0))
    // Huge hysteresis means "clearly better" never triggers; only the maxHold
    // variety rule can move it.
    expect(d.update([head, side], ctx(5000)).cut).toBe(false)
    const dec = d.update([head, side], ctx(9000))
    expect(dec.cut).toBe(true)
    expect(dec.activeId).toBe('side')
  })

  it('honors a manual override and resumes auto when cleared', () => {
    const d = new CameraDirector()
    const cams = [sig('head', 'headon', { present: 1, facing: 1 }), sig('crowd', 'crowd')]
    d.update(cams, ctx(0))
    d.setManual('crowd')
    expect(d.update(cams, ctx(100)).activeId).toBe('crowd')
    d.setManual(null)
    // Auto takes over again; head-on is the strong shot.
    expect(d.update(cams, ctx(20000)).activeId).toBe('head')
  })

  it('does not cut to a looked-at camera when its look-switch is off', () => {
    // Big maxHold so the forced-variety rule never fires during the window.
    const d = new CameraDirector({ maxHoldMs: 600000 })
    const a = sig('sideA', 'side', { present: 1, motion: 0.5 })
    const b = sig('sideB', 'side', { present: 1, facing: 1, lookSwitch: false })
    d.update([a, b], ctx(0))
    // Past min hold: facing B (lookSwitch off) must not pull the program onto it.
    expect(d.update([a, b], ctx(5000)).activeId).toBe('sideA')
    // With lookSwitch on, the same facing wins.
    const b2 = sig('sideB', 'side', { present: 1, facing: 1, lookSwitch: true })
    const d2 = new CameraDirector({ maxHoldMs: 600000 })
    d2.update([a, b2], ctx(0))
    expect(d2.update([a, b2], ctx(5000)).activeId).toBe('sideB')
  })

  it('quantizes discretionary cuts to the beat when switchOnBeat is on', () => {
    const d = new CameraDirector({ switchOnBeat: true, minHoldMs: 1000, maxHoldMs: 60000 })
    const head = sig('head', 'headon', { present: 1, facing: 0.2 })
    const crowd = sig('crowd', 'crowd')
    d.update([head, crowd], ctx(0, { onBeat: true })) // opens on head
    // A clearly-better crowd on a drop, but off-beat -> hold.
    const off = d.update([head, crowd], ctx(3000, { onBeat: false, audioLevel: 1, surge: 1 }))
    expect(off.cut).toBe(false)
    // Same moment, on the beat -> it cuts.
    const on = d.update([head, crowd], ctx(3200, { onBeat: true, audioLevel: 1, surge: 1 }))
    expect(on.cut).toBe(true)
    expect(on.activeId).toBe('crowd')
  })
})

describe('holdBoundsFromAverage', () => {
  it('brackets the average with a min below and a max above', () => {
    const { minHoldMs, maxHoldMs } = holdBoundsFromAverage(5000)
    expect(minHoldMs).toBeLessThan(5000)
    expect(maxHoldMs).toBeGreaterThan(5000)
    expect(minHoldMs).toBeLessThan(maxHoldMs)
  })
})
