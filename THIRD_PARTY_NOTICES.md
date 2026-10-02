# Third-party notices

Flashlight is distributed with open-source dependencies whose licenses remain with their
respective authors. `package-lock.json` is the authoritative dependency inventory for a source
checkout.

Notable runtime components bundled in packaged builds include:

| Component                  | Purpose                                 | License                               | Upstream                                                 |
| -------------------------- | --------------------------------------- | ------------------------------------- | -------------------------------------------------------- |
| Electron                   | Desktop runtime                         | MIT and Chromium third-party licenses | <https://www.electronjs.org/>                            |
| FFmpeg via `ffmpeg-static` | Recording repair and MP4/MOV conversion | GPL-3.0-or-later build                | <https://github.com/eugeneware/ffmpeg-static>            |
| MediaPipe Tasks Vision     | Pose and face landmark inference        | Apache-2.0                            | <https://ai.google.dev/edge/mediapipe/solutions/vision>  |
| React                      | User interface                          | MIT                                   | <https://react.dev/>                                     |
| SerialPort                 | Enttec-compatible serial communication  | MIT                                   | <https://serialport.io/>                                 |
| `music-metadata`           | Audio metadata parsing                  | MIT                                   | <https://github.com/Borewit/music-metadata>              |
| `fast-xml-parser`          | rekordbox XML parsing/building          | MIT                                   | <https://github.com/NaturalIntelligence/fast-xml-parser> |

Packaged applications include the project MIT license, this notice, the Apache 2.0 text used by
MediaPipe, and the FFmpeg build's license/readme under the application resources directory. Electron
also carries its own runtime license and Chromium notices inside the application bundle.

FFmpeg is invoked as a separate executable after recording. Flashlight does not link its source
code into FFmpeg. The exact FFmpeg build information and corresponding-source directions are in the
bundled `FFmpeg-README.txt`; review the upstream project when redistributing modified binaries.

This notice is provided for attribution and distribution clarity and is not legal advice.
