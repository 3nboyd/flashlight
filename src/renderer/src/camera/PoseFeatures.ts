import { POSE, type Landmark, type PoseFrame } from './PoseEngine'

/**
 * Turns a stream of pose frames into smooth, normalized "body features" the
 * visual engine can react to - the movement analog of the audio MusicPulse.
 * All values 0-1, deterministic EMAs.
 */
export interface PoseFeatureState {
  present: number // smoothed 0-1: is a person on camera
  handsUp: number // 0-1: how high the hands are raised (above the shoulders)
  armSpread: number // 0-1: how wide the arms are spread
  motion: number // 0-1: overall body movement energy
  handPulse: number // 0-1: decaying flash on a sharp hand pump (rhythmic hits)
  jump: number // 0-1: decaying flash when the body launches upward (a jump)
  centerX: number // 0-1: body center x (for framing / positioned effects)
  centerY: number // 0-1: body center y
}

const ZERO: PoseFeatureState = {
  present: 0,
  handsUp: 0,
  armSpread: 0,
  motion: 0,
  handPulse: 0,
  jump: 0,
  centerX: 0.5,
  centerY: 0.5
}

export class PoseFeatures {
  private readonly fps: number
  private prev: Landmark[] | null = null
  private state: PoseFeatureState = { ...ZERO }
  private handPulseEnv = 0
  private prevWristVy = 0
  private jumpEnv = 0
  private prevHipY = 0

  constructor(framesPerSecond = 30) {
    this.fps = framesPerSecond
  }

  reset(): void {
    this.prev = null
    this.state = { ...ZERO }
    this.handPulseEnv = 0
    this.prevWristVy = 0
    this.jumpEnv = 0
    this.prevHipY = 0
  }

  addFrame(frame: PoseFrame): PoseFeatureState {
    const aPresent = 1 - Math.exp(-1 / (this.fps * 0.25))
    if (!frame.present || frame.landmarks.length < 33) {
      this.state.present += aPresent * (0 - this.state.present)
      this.handPulseEnv *= Math.exp(-1 / (this.fps * 0.3))
      this.jumpEnv *= Math.exp(-1 / (this.fps * 0.3))
      this.state.handPulse = this.handPulseEnv
      this.state.jump = this.jumpEnv
      this.prev = null
      return this.state
    }
    const lm = frame.landmarks
    this.state.present += aPresent * (1 - this.state.present)

    const lSh = lm[POSE.leftShoulder]
    const rSh = lm[POSE.rightShoulder]
    const lWr = lm[POSE.leftWrist]
    const rWr = lm[POSE.rightWrist]
    const lHip = lm[POSE.leftHip]
    const rHip = lm[POSE.rightHip]

    const shoulderY = (lSh.y + rSh.y) / 2
    const hipY = (lHip.y + rHip.y) / 2
    const torso = Math.max(0.05, hipY - shoulderY) // normalized torso height
    const shoulderW = Math.max(0.05, Math.abs(lSh.x - rSh.x))

    // Hands up: wrist raised above the shoulder line, scaled by torso height.
    const raise = (wristY: number): number => Math.max(0, Math.min(1, (shoulderY - wristY) / torso + 0.15))
    const handsUp = (raise(lWr.y) + raise(rWr.y)) / 2

    // Arm spread: horizontal wrist distance relative to shoulder width.
    const armSpread = Math.max(0, Math.min(1, (Math.abs(lWr.x - rWr.x) / shoulderW - 0.6) / 2.4))

    // Motion: mean per-frame movement of the tracked joints (more sensitive).
    let motion = 0
    if (this.prev && this.prev.length === lm.length) {
      const joints = [
        POSE.leftWrist,
        POSE.rightWrist,
        POSE.leftElbow,
        POSE.rightElbow,
        POSE.leftKnee,
        POSE.rightKnee,
        POSE.nose
      ]
      let sum = 0
      for (const j of joints) {
        sum += Math.hypot(lm[j].x - this.prev[j].x, lm[j].y - this.prev[j].y)
      }
      motion = Math.min(1, Math.pow((sum / joints.length) * 22, 0.85))
    }

    // Jump: the whole body launches upward (hips move up sharply).
    const hipVy = this.prevHipY ? hipY - this.prevHipY : 0
    if (hipVy < -0.012) this.jumpEnv = Math.min(1, this.jumpEnv + Math.min(1, -hipVy * 30))
    this.prevHipY = hipY
    this.jumpEnv *= Math.exp(-1 / (this.fps * 0.3))
    this.state.jump = this.jumpEnv

    // Hand pulse: a downward flick of the wrists (velocity reversal) fires a
    // decaying flash - the body equivalent of hitting the beat with your hands.
    const wristVy = this.prev ? (lWr.y - this.prev[POSE.leftWrist].y + (rWr.y - this.prev[POSE.rightWrist].y)) / 2 : 0
    if (this.prevWristVy < -0.006 && wristVy > 0.006) this.handPulseEnv = 1 // up then sharp down
    this.prevWristVy = wristVy
    this.handPulseEnv *= Math.exp(-1 / (this.fps * 0.3))

    const aFast = 1 - Math.exp(-1 / (this.fps * 0.18))
    this.state.handsUp += aFast * (handsUp - this.state.handsUp)
    this.state.armSpread += aFast * (armSpread - this.state.armSpread)
    this.state.motion += aFast * (motion - this.state.motion)
    this.state.handPulse = this.handPulseEnv
    this.state.centerX = (lSh.x + rSh.x + lHip.x + rHip.x) / 4
    this.state.centerY = (shoulderY + hipY) / 2

    this.prev = lm
    return this.state
  }
}
