const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const {
  computeAppDir,
  computeEnvPath,
  computeDataDir,
  computeBinDir,
} = require('../components/RuntimePaths')

test('computeAppDir returns the folder containing the exe when packaged', () => {
  const result = computeAppDir({
    isPackaged: true,
    execPath: 'C:\\Tools\\OlxMonitor\\OlxMonitor.exe',
    moduleDir: '/unused',
  })
  assert.equal(result, 'C:\\Tools\\OlxMonitor')
})

test('computeAppDir returns the project root two levels above moduleDir in dev', () => {
  const moduleDir = path.join('/repo', 'src', 'components')
  const result = computeAppDir({ isPackaged: false, execPath: '/usr/bin/node', moduleDir })
  assert.equal(result, path.join('/repo'))
})

test('computeEnvPath resolves to appDir/.env when packaged', () => {
  const result = computeEnvPath({ isPackaged: true, appDir: 'C:\\Apps\\OlxMonitor', moduleDir: '/unused' })
  assert.equal(result, 'C:\\Apps\\OlxMonitor\\.env')
})

test('computeEnvPath resolves to src/.env in dev', () => {
  const moduleDir = path.join('/repo', 'src', 'components')
  const result = computeEnvPath({ isPackaged: false, appDir: '/repo', moduleDir })
  assert.equal(result, path.join('/repo', 'src', '.env'))
})

test('computeDataDir and computeBinDir join onto appDir using the right path style', () => {
  assert.equal(computeDataDir('C:\\Apps\\OlxMonitor', true), 'C:\\Apps\\OlxMonitor\\data')
  assert.equal(computeBinDir('C:\\Apps\\OlxMonitor', true), 'C:\\Apps\\OlxMonitor\\bin')
  assert.equal(computeDataDir('/repo', false), path.join('/repo', 'data'))
  assert.equal(computeBinDir('/repo', false), path.join('/repo', 'bin'))
})
