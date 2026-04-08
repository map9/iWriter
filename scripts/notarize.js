require('dotenv').config()
const fs = require('node:fs')
const path = require('node:path')
const { notarize } = require('@electron/notarize')

exports.default = async function notarizing(context) {
  const { appOutDir } = context
  const appName = context.packager.appInfo.productFilename

  // Only notarize macOS app bundles. electron-builder can invoke this hook
  // for other targets as well, such as Windows builds started on macOS.
  if (context.electronPlatformName !== 'darwin') {
    return
  }

  const appPath = path.join(appOutDir, `${appName}.app`)
  if (!fs.existsSync(appPath)) {
    return
  }

  if (
    !process.env.APPLE_ID ||
    !process.env.APPLE_APP_SPECIFIC_PASSWORD ||
    !process.env.APPLE_TEAM_ID
  ) {
    return
  }

  return await notarize({
    appBundleId: 'com.iwriter.app',
    appPath,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID
  })
}
