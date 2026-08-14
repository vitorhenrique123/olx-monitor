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
  const outSqlite3Dir = path.join(OUT_DIR, 'node_modules', 'sqlite3')
  copyDir(
    path.join(ROOT, 'node_modules', 'sqlite3'),
    outSqlite3Dir
  )

  // O binário copiado acima é o compilado localmente (macOS) — substitui
  // pelo prebuild real de Windows, buscado via rede (sem precisar de
  // toolchain de cross-compilação nem de uma máquina Windows).
  fs.rmSync(path.join(outSqlite3Dir, 'build', 'Release', 'node_sqlite3.node'), { force: true })
  execFileSync(
    'npx',
    ['prebuild-install', '--platform=win32', '--arch=x64', '--runtime=napi'],
    { cwd: outSqlite3Dir, stdio: 'inherit', shell: true }
  )
  fs.rmSync(path.join(outSqlite3Dir, 'build', 'Release', 'node_sqlite3.node.bak'), { force: true })

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
