import { useEffect, useRef, type JSX } from 'react'

export type ScreenLook = 'flat' | 'radial'

/**
 * A stage TV / LED-screen surface driven purely by the lighting: it paints the
 * live color of a screen fixture, pulsing on the beat. `flat` fills the whole
 * panel; `radial` glows from the center out (reads as a circular pulse behind
 * the rig). This is the base layer; a camera effect can be blended over it.
 */
export function ScreenBase({
  colorRef,
  beatRef,
  look,
  className
}: {
  colorRef: React.MutableRefObject<{ r: number; g: number; b: number }>
  beatRef: React.MutableRefObject<number>
  look: ScreenLook
  className?: string
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const lookRef = useRef(look)
  lookRef.current = look

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let raf = 0
    const loop = (): void => {
      const w = (canvas.width = canvas.clientWidth || canvas.width)
      const h = (canvas.height = canvas.clientHeight || canvas.height)
      const c = colorRef.current
      // Brighten right on the beat (beatPhase 0 = the hit).
      const pulse = 0.72 + 0.28 * Math.pow(1 - beatRef.current, 2)
      const r = Math.min(255, c.r * pulse) | 0
      const g = Math.min(255, c.g * pulse) | 0
      const b = Math.min(255, c.b * pulse) | 0
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)
      if (lookRef.current === 'radial') {
        const grad = ctx.createRadialGradient(
          w / 2,
          h / 2,
          Math.min(w, h) * 0.04,
          w / 2,
          h / 2,
          Math.max(w, h) * 0.62
        )
        grad.addColorStop(0, `rgb(${r},${g},${b})`)
        grad.addColorStop(1, '#000')
        ctx.fillStyle = grad
      } else {
        ctx.fillStyle = `rgb(${r},${g},${b})`
      }
      ctx.fillRect(0, 0, w, h)
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [colorRef, beatRef])

  return <canvas ref={canvasRef} className={className} />
}
