import { join } from 'path'
import type { AppSettings } from '@core/settings/types'
import type { LibrarySyncConfig } from '@core/fileops/LibrarySync'
import type { Platform } from '@core/library/seratoPath'

function currentPlatform(): Platform {
  if (process.platform === 'win32') return 'win32'
  if (process.platform === 'darwin') return 'darwin'
  return 'linux'
}

export function buildLibrarySyncConfig(settings: AppSettings): LibrarySyncConfig {
  const config: LibrarySyncConfig = { platform: currentPlatform() }

  if (settings.serato.enabled && settings.serato.rootPath) {
    config.serato = {
      databasePath: join(settings.serato.rootPath, 'database V2'),
      subcratesDir: join(settings.serato.rootPath, 'Subcrates')
    }
  }

  if (settings.virtualDj.enabled && settings.virtualDj.databasePath) {
    config.virtualDj = { databasePath: settings.virtualDj.databasePath }
  }

  return config
}
