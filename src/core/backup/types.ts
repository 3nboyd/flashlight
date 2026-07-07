export interface BackupEntry {
  id: string
  category: 'serato-db' | 'serato-crate' | 'serato-tag' | 'virtualdj-db' | 'rekordbox-xml' | 'other'
  originalPath: string
  backupPath: string
  sizeBytes: number
  createdAt: string
}
