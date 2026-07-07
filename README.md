# DJ Companion

An open-source, cross-platform (macOS/Windows) desktop companion app for DJs — the library
management tools that Serato, VirtualDJ, and rekordbox don't give you on their own.

Built with Electron + React + TypeScript. Dark theme, configurable accent color.

## What it does (v1: Library)

- **Cross-platform hotcue/loop sync** — read and write hotcues, loops, and track color for
  **Serato** (embedded in the audio file's ID3 tags), **VirtualDJ** (`database.xml`), and export
  to **rekordbox** (`rekordbox.xml`, the standard bridge onto a CDJ USB stick).
- **Unified library view** — one table across every format, showing tags, hotcues, loops, and
  which platform(s) know about each track.
- **File explorer** — move, copy, rename, and mass-select tracks. Every database that references
  a moved file (Serato's database + crates, VirtualDJ's `database.xml`) gets its path updated
  automatically.
- **Automatic backups** — every write to a database file or embedded tag is snapshotted first,
  with time- and size-based retention pruning. Browse and restore snapshots from the Backups tab.
- **Rename/cleaning engine** — deterministic (no AI) fixes for messy download filenames: strips
  promo junk like "FREE DOWNLOAD" / "OUT NOW", fixes ALL CAPS/lowercase titles, detects and
  corrects swapped artist/title order using your existing ID3 tags and library as signal. Nothing
  is renamed until you review and approve it.

## Why the formats are handled the way they are

- **Serato** doesn't use a database of hotcues — cues/loops/color/BPM-lock live *inside the audio
  file itself*, as base64-encoded binary data in an ID3 `GEOB` frame called `Serato Markers2`
  (MP3 only for now — see Roadmap). The `_Serato_/database V2` file and `_Serato_/Subcrates/*.crate`
  files just track which files exist and which crate they belong to; this app updates those paths
  when you move a file, but the actual cue data travels with the audio file.
- **VirtualDJ** stores everything in one `database.xml`, with `<Poi>` elements per hotcue. VDJ is
  strict about the file's exact whitespace convention (`<Song>` at 1-space indent, its children at
  2-space indent) — a generic XML pretty-printer's output gets rejected as a corrupted database, so
  this app hand-writes only the specific `<Song>` blocks it touches and leaves everything else as
  an untouched substring of the original file.
- **CDJ/rekordbox**: Pioneer's USB database format (`.pdb`) is proprietary and writing it directly
  is still unsolved even by projects like Mixxx. The reliable path is exporting a `rekordbox.xml`
  from this app, importing it into rekordbox, and syncing to USB from there.

### A note on trust

The binary/XML format details above come from community reverse-engineering docs, not official
specs. Every writer in this app is built to **preserve anything it doesn't explicitly understand**
(unknown record types, unrecognized tag fields, unmodified `<Song>` blocks) rather than
reconstructing files from scratch — and every write is backed up automatically first. That said:
**point this at a copy of your library until you've verified it against your own setup.**

## Getting started

```bash
npm install
npm run dev      # launch in development
npm test         # run the test suite
npm run build    # production build
npm run build:mac    # build a macOS .dmg
npm run build:win    # build a Windows installer
```

Requires Node 20+.

## Architecture

```
src/
  core/            framework-free TypeScript — parsers, writers, business logic.
                    Fully unit-tested; no Electron/React imports.
    binary/        low-level binary reader/writer used by every binary format
    formats/
      serato/      database V2 + .crate TLV parser, Markers2/BeatGrid GEOB tag codec
      virtualdj/   database.xml parser/serializer (whitespace-exact)
      rekordbox/   rekordbox.xml export/import
    library/       unified Track model, cue-format mapping, folder scanner
    fileops/       move/copy/rename + cross-database path sync
    rename/        filename cleaning rules + artist/title swap detection
    backup/        automatic snapshot + retention pruning
    settings/      app settings shape
  main/            Electron main process — IPC handlers wrapping core/
  preload/         contextBridge — typed API surface exposed to the renderer
  renderer/        React UI (dark theme, views, state)
```

Every format module has a test suite that round-trips real/synthetic fixtures byte-for-byte and
verifies unrelated data survives an edit untouched — see `src/core/**/*.test.ts`.

## Roadmap

- [ ] Serato hotcue/loop read+write for FLAC (Vorbis comments) and M4A/MP4 (custom atoms) — MP3
      (ID3 `GEOB`) is fully supported today
- [ ] Direct rekordbox USB (`.pdb`) writing, if/when the format becomes tractable to write safely
- [ ] MusicBrainz/AcoustID fingerprinting fallback for filenames too mangled for heuristic cleaning
- [ ] Waveform/Overview tag support

## Contributing

Issues and PRs welcome. Please include a test for any format-parsing change — correctness there is
the whole point of this project, since it's writing into people's irreplaceable DJ libraries.

## License

MIT — see [LICENSE](LICENSE).
