import type { PoseFeatureState } from './PoseFeatures'
import type { FaceFrame } from './FaceEngine'
import type { CameraRole } from '@core/camera/roles'
import type { CameraSignal } from '@core/camera/CameraDirector'

/**
 * Turns one camera's detection into a director CameraSignal. `facing` is how
 * head-on the subject is to THIS camera (from face yaw); `lookingAtBoard` is the
 * inverse when a body is present - i.e. the DJ is turned away from this lens,
 * toward the decks. That is exactly what makes the side-mounted laptop camera
 * eligible only when the DJ works the board (face turned away), never when they
 * look straight at the laptop screen (face frontal to it).
 */
export function framingSignal(
  id: string,
  role: CameraRole,
  feat: PoseFeatureState,
  face: FaceFrame | null
): CameraSignal {
  const present = feat.present
  const motion = feat.motion

  let facing = 0
  if (face?.present && face.landmarks.length >= 468) {
    const lm = face.landmarks
    const leftEye = lm[33]
    const rightEye = lm[263]
    const nose = lm[1]
    const eyeMidX = (leftEye.x + rightEye.x) / 2
    const eyeW = Math.abs(rightEye.x - leftEye.x) || 0.01
    // Nose centered between the eyes => looking straight at the lens.
    const yaw = (nose.x - eyeMidX) / eyeW
    facing = Math.max(0, 1 - Math.abs(yaw) * 3)
  } else if (present > 0.3) {
    // Body present but no frontal face: the subject is turned away from us.
    facing = 0.15
  }

  const lookingAtBoard = present > 0.3 ? Math.max(0, Math.min(1, 1 - facing)) : 0
  return { id, role, present, motion, facing, lookingAtBoard }
}
