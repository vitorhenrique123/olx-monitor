const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  getVbsContent,
  escapeForVbs,
  getShortcutPath,
  isInstalled,
  install,
  uninstall,
} = require('../components/StartupManager')

const tempAppData = () => fs.mkdtempSync(path.join(os.tmpdir(), 'olx-appdata-'))

test('escapeForVbs doubles double-quote characters', () => {
  assert.equal(escapeForVbs('C:\\Program Files\\App.exe'), 'C:\\Program Files\\App.exe')
  assert.equal(escapeForVbs('C:\\a"b.exe'), 'C:\\a""b.exe')
})

test('getVbsContent embeds the exe path and runs it hidden', () => {
  const content = getVbsContent('C:\\Apps\\OlxMonitor\\OlxMonitor.exe')
  assert.match(content, /WScript\.Shell/)
  assert.match(content, /OlxMonitor\.exe/)
  assert.match(content, /, 0, False/)
})

test('install writes the vbs to the startup folder and isInstalled reflects it', () => {
  const env = { APPDATA: tempAppData() }

  assert.equal(isInstalled(env), false)
  install('C:\\Apps\\OlxMonitor\\OlxMonitor.exe', env)
  assert.equal(isInstalled(env), true)

  const written = fs.readFileSync(getShortcutPath(env))
  assert.deepEqual([written[0], written[1]], [0xFF, 0xFE]) // BOM UTF-16LE
  const withoutBom = written.subarray(2).toString('utf16le')
  assert.match(withoutBom, /OlxMonitor\.exe/)
})

test('uninstall removes the shortcut and is idempotent', () => {
  const env = { APPDATA: tempAppData() }

  install('C:\\Apps\\OlxMonitor\\OlxMonitor.exe', env)
  assert.equal(isInstalled(env), true)

  uninstall(env)
  assert.equal(isInstalled(env), false)

  uninstall(env)
  assert.equal(isInstalled(env), false)
})
