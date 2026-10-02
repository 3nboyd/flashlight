const fs = require('fs')
const path = require('path')
const plist = require('plist')

const CAMERA_DESCRIPTION =
  'Flashlight uses connected cameras for live previews, projection visuals, automatic camera direction, and recordings.'
const MICROPHONE_DESCRIPTION =
  'Flashlight uses the selected audio input for music-reactive lighting and optional recording audio.'

function findHelperPlists(directory) {
  const results = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (entry.name.endsWith('.app')) {
        const infoPath = path.join(fullPath, 'Contents', 'Info.plist')
        if (fs.existsSync(infoPath)) results.push(infoPath)
      } else {
        results.push(...findHelperPlists(fullPath))
      }
    }
  }
  return results
}

/**
 * Chromium requests camera/microphone access from helper applications on macOS.
 * electron-builder's `extendInfo` updates the main bundle only, so copy the
 * usage keys into helper Info.plists before code signing.
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appName = context.packager.appInfo.productFilename
  const frameworksDir = path.join(context.appOutDir, `${appName}.app`, 'Contents', 'Frameworks')
  if (!fs.existsSync(frameworksDir)) return

  for (const infoPath of findHelperPlists(frameworksDir)) {
    const info = plist.parse(fs.readFileSync(infoPath, 'utf8'))
    info.NSCameraUsageDescription = CAMERA_DESCRIPTION
    info.NSCameraUseContinuityCameraDeviceType = true
    info.NSMicrophoneUsageDescription = MICROPHONE_DESCRIPTION
    fs.writeFileSync(infoPath, plist.build(info))
  }
}
