/** Where a camera is pointed / what it captures, used by the auto-director. */
export type CameraRole = 'headon' | 'laptop' | 'side' | 'overhead' | 'crowd' | 'other'

export const CAMERA_ROLES: { role: CameraRole; label: string; hint: string }[] = [
  { role: 'headon', label: 'Head-on', hint: 'Faces the DJ straight on - the main shot' },
  { role: 'laptop', label: 'Laptop', hint: 'To the side; used only when working the deck' },
  { role: 'side', label: 'Side view', hint: 'Profile / angled coverage' },
  { role: 'overhead', label: 'Overhead', hint: 'Top-down on the decks / hands' },
  { role: 'crowd', label: 'Crowd', hint: 'The dancefloor - cut here on drops' },
  { role: 'other', label: 'Other', hint: 'General coverage' }
]

export const DEFAULT_CAMERA_ROLE: CameraRole = 'headon'

export const ROLE_LABEL: Record<CameraRole, string> = Object.fromEntries(
  CAMERA_ROLES.map((r) => [r.role, r.label])
) as Record<CameraRole, string>

/** Whether "look = switch" is on by default for a role (off for the laptop). */
export function defaultLookSwitch(role: CameraRole): boolean {
  return role !== 'laptop'
}
