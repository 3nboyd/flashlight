# Music-library tools

## Supported scanning

The Library view recursively scans configured folders for MP3, FLAC, WAV, AIFF/AIF, M4A, and MP4
audio files. Standard metadata comes from `music-metadata`. MP3 files are additionally inspected for
Serato Markers2 tags and converted into the unified cue/loop model.

Current scan limitations:

- Serato cue/loop data in FLAC and M4A is not read.
- VirtualDJ and rekordbox databases are not merged into the visible Library table.
- The Library table is an in-memory result; it is rebuilt on each scan.

## File explorer

The explorer can create folders and copy, move, rename, or delete selected entries. Cross-volume
moves fall back to copy-then-delete and remove the source only after the copy succeeds. Existing
destinations are not overwritten.

Deletion uses the filesystem directly and is not sent to the Trash/Recycle Bin. Confirm selections
and maintain external backups.

## Database path synchronization

When enabled and configured:

- Serato `_Serato_/database V2` matching paths are updated.
- Matching paths inside `_Serato_/Subcrates/*.crate` are updated.
- Matching VirtualDJ `<Song FilePath>` entries in `database.xml` are updated.

For moved directories, the app walks files at the new location and derives each old path. Files not
known to a configured database are normal no-ops.

Each database/crate is snapshotted immediately before it is overwritten. Copies are not added to DJ
databases automatically; only moves and renames synchronize existing references.

## Rename review

The rename engine is deterministic and local. It can remove download/promo phrases and URLs, repair
common encoded characters, normalize whitespace/underscores and number prefixes, correct casing,
and recommend artist/title swaps using existing tags and artists seen in the folder.

Suggestions are shown before changes are applied. Selected renames also pass through database path
synchronization. The current UI scans audio files directly inside the selected folder for rename
candidates; nested folders are scanned for metadata but are not offered as rename rows.

## Backups

`BackupManager` stores snapshots and a manifest in Electron's user-data location. Retention can be
limited by age and total bytes. The Backups view lists snapshots, prunes immediately, and restores a
selected snapshot to its original path.

Backups protect app-mediated database/tag writes; they are not a general library backup and do not
cover arbitrary file deletion, drive failure, or edits made by other applications.

## Format implementation status

Core modules parse/write Serato database/crate records and MP3 tags, preserve VirtualDJ XML segments,
and parse/build rekordbox XML. Cue mapping between the unified model and each format is tested.

Those modules are foundations, not a currently complete cross-platform cue-sync UI. Until a future
workflow connects selection, conflict resolution, backup, write, and verification, do not describe
the app as exporting rekordbox XML or writing cues across all three platforms.

## Safe-use checklist

1. Back up the DJ library independently.
2. Quit or stop library writes in Serato/VirtualDJ before app-mediated moves.
3. Configure paths against copied test data first.
4. Move one track and verify the DJ software still finds it and preserves crate membership.
5. Restore a test snapshot before depending on restore during an emergency.
