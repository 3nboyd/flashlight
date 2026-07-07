import type { DjCompanionApi } from './index'

declare global {
  interface Window {
    djCompanion: DjCompanionApi
  }
}
