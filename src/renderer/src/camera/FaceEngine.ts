import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

/**
 * Detailed face tracking (MediaPipe Face Landmarker, 478 landmarks) for the
 * face-mesh / outline looks. Model + WASM bundled locally under /mediapipe.
 */

export interface FacePoint {
  x: number
  y: number
}

export interface FaceFrame {
  present: boolean
  landmarks: FacePoint[] // 478 when present
}

const WASM_PATH = './mediapipe/wasm'
const MODEL_PATH = './mediapipe/models/face_landmarker.task'

export class FaceEngine {
  private landmarker: FaceLandmarker | null = null
  private lastTs = -1

  async init(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH)
    for (const delegate of ['GPU', 'CPU'] as const) {
      try {
        this.landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_PATH, delegate },
          runningMode: 'VIDEO',
          numFaces: 1
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

  detect(video: HTMLVideoElement, tsMs: number): FaceFrame | null {
    if (!this.landmarker) return null
    const ts = tsMs <= this.lastTs ? this.lastTs + 1 : tsMs
    this.lastTs = ts
    const res = this.landmarker.detectForVideo(video, ts)
    const f = res.faceLandmarks?.[0]
    if (!f || f.length === 0) return { present: false, landmarks: [] }
    return { present: true, landmarks: f.map((p) => ({ x: p.x, y: p.y })) }
  }

  close(): void {
    this.landmarker?.close()
    this.landmarker = null
    this.lastTs = -1
  }
}

/** Face contour connectors (pairs of landmark indices) for line drawing. */
export const FACE_CONTOURS: { start: number; end: number }[][] = [
  FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
  FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
  FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
  FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
  FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
  FaceLandmarker.FACE_LANDMARKS_LIPS,
  FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS,
  FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS
]

export const FACE_TESSELATION: { start: number; end: number }[] = FaceLandmarker.FACE_LANDMARKS_TESSELATION
