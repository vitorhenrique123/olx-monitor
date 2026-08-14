const fs = require('fs')
const path = require('path')

const SHORTCUT_NAME = 'olx-monitor-autostart.vbs'

const escapeForVbs = (value) => value.replace(/"/g, '""')

const getVbsContent = (exePath) => `Set WshShell = CreateObject("WScript.Shell")
WshShell.Run """${escapeForVbs(exePath)}""", 0, False
`

// path (não path.win32) porque esta operação sempre executa I/O real no
// host atual: em teste isso é uma pasta temporária no Mac/Linux, em
// produção é o %APPDATA% real do Windows — nos dois casos o path nativo
// do processo em execução é o correto.
const getStartupFolder = (env = process.env) => path.join(
  env.APPDATA || '',
  'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'
)

const getShortcutPath = (env = process.env) => path.join(getStartupFolder(env), SHORTCUT_NAME)

const isInstalled = (env = process.env) => fs.existsSync(getShortcutPath(env))

// UTF-16LE com BOM: sem o BOM o wscript.exe lê o .vbs usando a codepage
// ANSI do sistema, o que corrompe caracteres não-ASCII no caminho do exe
// (ex.: C:\Users\João\...) e faz o início automático falhar em silêncio.
const install = (exePath, env = process.env) => {
  const folder = getStartupFolder(env)
  fs.mkdirSync(folder, { recursive: true })
  const bom = Buffer.from([0xFF, 0xFE])
  const utf16Content = Buffer.from(getVbsContent(exePath), 'utf16le')
  fs.writeFileSync(getShortcutPath(env), Buffer.concat([bom, utf16Content]))
}

const uninstall = (env = process.env) => {
  const shortcutPath = getShortcutPath(env)
  if (fs.existsSync(shortcutPath)) fs.unlinkSync(shortcutPath)
}

module.exports = { getVbsContent, escapeForVbs, getStartupFolder, getShortcutPath, isInstalled, install, uninstall }
