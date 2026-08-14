const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'dist-win', 'OlxMonitor')

const clean = () => {
  fs.rmSync(path.join(ROOT, 'dist-win'), { recursive: true, force: true })
  fs.mkdirSync(OUT_DIR, { recursive: true })
}

const runPkg = () => {
  execFileSync(
    'npx',
    ['pkg', '.', '--target', 'node22-win-x64', '--output', path.join(OUT_DIR, 'OlxMonitor.exe')],
    { cwd: ROOT, stdio: 'inherit', shell: true }
  )
}

const copyDir = (from, to) => {
  fs.mkdirSync(to, { recursive: true })
  fs.cpSync(from, to, { recursive: true })
}

const assembleNativeDeps = () => {
  // sqlite3 tem um addon nativo (.node); shipar a pasta inteira, intacta,
  // fora do snapshot do pkg é mais confiável do que tentar fazer o pkg
  // embutir/extrair só o binário (ver comentário no database.js).
  copyDir(
    path.join(ROOT, 'node_modules', 'sqlite3'),
    path.join(OUT_DIR, 'node_modules', 'sqlite3')
  )

  fs.mkdirSync(path.join(OUT_DIR, 'bin'), { recursive: true })
  fs.copyFileSync(
    path.join(ROOT, 'node_modules', 'cycletls', 'dist', 'index.exe'),
    path.join(OUT_DIR, 'bin', 'cycletls.exe')
  )
}

const writeEnvExample = () => {
  fs.copyFileSync(path.join(ROOT, '.env.example'), path.join(OUT_DIR, '.env.example'))
}

const main = () => {
  clean()
  runPkg()
  assembleNativeDeps()
  writeEnvExample()
  console.log(`Build concluído em ${OUT_DIR}`)
}

main()
