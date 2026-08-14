const path = require('path')
const fs = require('fs')

// Packaged mode only ever runs on Windows, so exe-path math always uses
// path.win32 explicitly — that keeps it correct (and testable) regardless
// of which OS is actually running this code right now.
const pathModuleFor = (isPackaged) => (isPackaged ? path.win32 : path)

const computeAppDir = ({ isPackaged, execPath, moduleDir }) => {
  if (isPackaged) return path.win32.dirname(execPath)
  return path.join(moduleDir, '..', '..')
}

const computeEnvPath = ({ isPackaged, appDir, moduleDir }) => {
  if (isPackaged) return path.win32.join(appDir, '.env')
  return path.join(moduleDir, '..', '.env')
}

const computeDataDir = (appDir, isPackaged) => pathModuleFor(isPackaged).join(appDir, 'data')
const computeBinDir = (appDir, isPackaged) => pathModuleFor(isPackaged).join(appDir, 'bin')

const isPackaged = () => !!process.pkg

const getAppDir = () => computeAppDir({
  isPackaged: isPackaged(),
  execPath: process.execPath,
  moduleDir: __dirname,
})

const getEnvPath = () => computeEnvPath({
  isPackaged: isPackaged(),
  appDir: getAppDir(),
  moduleDir: __dirname,
})

const getBinDir = () => computeBinDir(getAppDir(), isPackaged())

const getDataDir = () => {
  const dir = computeDataDir(getAppDir(), isPackaged())
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

module.exports = {
  isPackaged,
  getAppDir,
  getEnvPath,
  getBinDir,
  getDataDir,
  computeAppDir,
  computeEnvPath,
  computeDataDir,
  computeBinDir,
}
