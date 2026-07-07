export type ThemeAccent =
  | 'violet'
  | 'blue'
  | 'teal'
  | 'green'
  | 'amber'
  | 'red'
  | 'pink'
  | 'custom'

export interface AppSettings {
  accent: ThemeAccent
  customAccentHex: string
  backupRetentionDays: number
  backupMaxTotalBytes: number
  libraryFolders: string[]
  serato: {
    enabled: boolean
    rootPath: string | null
  }
  virtualDj: {
    enabled: boolean
    databasePath: string | null
  }
  rekordbox: {
    enabled: boolean
    exportPath: string | null
  }
}

export const DEFAULT_SETTINGS: AppSettings = {
  accent: 'violet',
  customAccentHex: '#8b5cf6',
  backupRetentionDays: 14,
  backupMaxTotalBytes: 500 * 1024 * 1024,
  libraryFolders: [],
  serato: {
    enabled: false,
    rootPath: null
  },
  virtualDj: {
    enabled: false,
    databasePath: null
  },
  rekordbox: {
    enabled: false,
    exportPath: null
  }
}

export const ACCENT_COLORS: Record<Exclude<ThemeAccent, 'custom'>, string> = {
  violet: '#8b5cf6',
  blue: '#3b82f6',
  teal: '#14b8a6',
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
  pink: '#ec4899'
}
