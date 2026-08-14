import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'

/**
 * Real-time body pose detection wrapping MediaPipe's Pose Landmarker (33 body
 * landmarks: face, shoulders, elbows, wrists, hips, knees, ankles). The WASM
 * runtime and model are bundled locally under /mediapipe so it works offline
 * inside Electron. One instance per detection pipeline; feed it video frames.
 */

export interface Landmark {
  x: number // 0..1 normalized to the frame width
  y: number // 0..1 normalized to the frame height
  z: number
  visibility: number
}

export interface PoseFrame {
  present: boolean
  landmarks: Landmark[] // 33 entries when present, else []
}

const WASM_PATH = './mediapipe/wasm'
const MODEL_PATH = './mediapipe/models/pose_landmarker_lite.task'

export class PoseEngine {
  private landmarker: PoseLandmarker | null = null
  private lastTs = -1

  /** Load the model. Tries the GPU delegate, falls back to CPU. */
  async init(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH)
    for (const delegate of ['GPU', 'CPU'] as const) {
      try {
        this.landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_PATH, delegate },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        })
        return
      } catch (err) {
        if (delegate === 'CPU') throw err
      }
    }
  }

  get ready(): boolean {
    return this.landmarker !== null
  }

  /** Detect on one video frame. `tsMs` must be monotonically increasing. */
  detect(video: HTMLVideoElement, tsMs: number): PoseFrame | null {
    if (!this.landmarker) return null
    // MediaPipe requires strictly increasing timestamps.
    const ts = tsMs <= this.lastTs ? this.lastTs + 1 : tsMs
    this.lastTs = ts
    const result = this.landmarker.detectForVideo(video, ts)
    const lm = result.landmarks?.[0]
    if (!lm || lm.length === 0) return { present: false, landmarks: [] }
    return {
      present: true,
      landmarks: lm.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility ?? 1 }))
    }
  }

  close(): void {
    this.landmarker?.close()
    this.landmarker = null
    this.lastTs = -1
  }
}

/** MediaPipe pose landmark indices we care about. */
export const POSE = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftPinky: 17,
  rightPinky: 18,
  leftIndex: 19,
  rightIndex: 20,
  leftThumb: 21,
  rightThumb: 22,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28
} as const

/** Bone connections for drawing the skeleton (pairs of landmark indices). */
export const POSE_BONES: [number, number][] = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
  [11, 0],
  [12, 0]
]
