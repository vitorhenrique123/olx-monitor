# OLX Monitor — Windows Exe Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package OLX Monitor as a standalone Windows `.exe` that starts hidden with Windows and can be fully configured (Telegram token, cron interval, ports, credentials) from the existing web UI, without editing `.env` by hand.

**Architecture:** Extract all filesystem paths (data dir, `.env`, native binaries) behind a `RuntimePaths` helper that resolves differently in dev vs. inside a `pkg`-built executable. Add a small `.env` read/write module (`EnvStore`) and wire new REST endpoints + a "Configurações" tab onto the Express server and web UI that already exist. Ship `sqlite3` and the `cycletls` sidecar binary as real files next to the `.exe` (not inside the `pkg` snapshot) since native addons/binaries can't run from a virtual filesystem. Auto-start is a tiny generated `.vbs` file dropped into the user's Startup folder — no Windows Service, no admin rights.

**Tech Stack:** Node.js, Express (already a dependency), `@yao-pkg/pkg` for the Windows build, Node's built-in `node:test` runner for automated tests (no new test framework), vanilla JS/HTML for the UI (matches existing `public/index.html`).

**Spec:** `docs/superpowers/specs/2026-08-13-windows-exe-design.md`

## Global Constraints

- No Node.js installation required on the target machine — the `.exe` embeds the runtime (spec: "Standalone").
- The program must run with **no visible window** after the first manual run — reached via a hidden-launch `.vbs`, not a GUI-subsystem rebuild (spec: "Oculto").
- Configuration lives in the **existing** web UI (`src/public/index.html`), as a new section — not a separate desktop window (spec: "Configuração").
- Auto-start uses the per-user Startup folder (`shell:startup`), never the registry or a Windows Service — no admin privileges required (spec: "Auto-start").
- **Cross-platform development reality:** this repo is developed on macOS. `@yao-pkg/pkg` can cross-compile a `node20-win-x64` binary from macOS (so Task 9's build step actually runs and its output can be inspected here), but the resulting `.exe` can only be *executed* on Windows. Every task below that touches pure logic (path math, `.env` templating, `.vbs` content, REST handlers) ships with an automated `node:test` test that runs on this machine. Tasks 9 and 10 are explicitly marked where verification must happen on a real Windows machine — do not claim those steps "pass" without a human actually running them on Windows.
- Never write real secrets into test fixtures or let a test touch the project's real `src/.env` (it currently holds a live Telegram bot token). Every test that reads/writes an `.env` file must use a temp directory.

---

### Task 1: `RuntimePaths` — resolve dirs/paths for dev vs. packaged

**Files:**
- Create: `src/components/RuntimePaths.js`
- Test: `src/test/RuntimePaths.test.js`

**Interfaces:**
- Produces: `isPackaged(): boolean`, `getAppDir(): string`, `getEnvPath(): string`, `getBinDir(): string`, `getDataDir(): string` (creates the dir if missing), plus the pure helpers `computeAppDir`, `computeEnvPath`, `computeDataDir`, `computeBinDir` used by later tasks' tests if needed.
- Consumes: nothing (foundational task).

- [ ] **Step 1: Write the failing tests**

Create `src/test/RuntimePaths.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `src/`): `node --test test/RuntimePaths.test.js`
Expected: FAIL — `Cannot find module '../components/RuntimePaths'`

- [ ] **Step 3: Implement `RuntimePaths.js`**

Create `src/components/RuntimePaths.js`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/RuntimePaths.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/RuntimePaths.js src/test/RuntimePaths.test.js
git commit -m "Add RuntimePaths helper for dev vs packaged path resolution"
```

---

### Task 2: `EnvStore` — read/write `.env` with a fixed template

**Files:**
- Create: `src/components/EnvStore.js`
- Create: `src/.env.example`
- Test: `src/test/EnvStore.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `FIELDS: string[]`, `DEFAULTS: object`, `readEnv(envPath): object` (always returns all `FIELDS` keys, filling missing ones with `DEFAULTS[key] || ''`), `writeEnv(envPath, values): object` (merges `values` onto the current file's content — a key **absent** from `values` keeps its current value, a key present with `''` clears it — then rewrites the file with fixed comments), `renderEnvFile(values): string`.

- [ ] **Step 1: Write the failing tests**

Create `src/test/EnvStore.test.js`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { readEnv, writeEnv, DEFAULTS } = require('../components/EnvStore')

const tempEnvPath = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'olx-env-')), '.env')

test('readEnv returns defaults when the file does not exist', () => {
  const envPath = tempEnvPath()
  const values = readEnv(envPath)
  assert.equal(values.CRON_INTERVAL, DEFAULTS.CRON_INTERVAL)
  assert.equal(values.UI_PORT, DEFAULTS.UI_PORT)
  assert.equal(values.TELEGRAM_TOKEN, '')
})

test('writeEnv then readEnv round-trips provided values', () => {
  const envPath = tempEnvPath()
  writeEnv(envPath, { TELEGRAM_TOKEN: 'abc:123', UI_PORT: '4000' })
  const values = readEnv(envPath)
  assert.equal(values.TELEGRAM_TOKEN, 'abc:123')
  assert.equal(values.UI_PORT, '4000')
  assert.equal(values.CRON_INTERVAL, DEFAULTS.CRON_INTERVAL)
})

test('writeEnv preserves fields not included in the update', () => {
  const envPath = tempEnvPath()
  writeEnv(envPath, { TELEGRAM_TOKEN: 'abc:123' })
  writeEnv(envPath, { UI_PORT: '5000' })
  const values = readEnv(envPath)
  assert.equal(values.TELEGRAM_TOKEN, 'abc:123')
  assert.equal(values.UI_PORT, '5000')
})

test('writeEnv clears a field when explicitly set to empty string', () => {
  const envPath = tempEnvPath()
  writeEnv(envPath, { UI_USERNAME: 'admin' })
  writeEnv(envPath, { UI_USERNAME: '' })
  const values = readEnv(envPath)
  assert.equal(values.UI_USERNAME, '')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/EnvStore.test.js`
Expected: FAIL — `Cannot find module '../components/EnvStore'`

- [ ] **Step 3: Implement `EnvStore.js`**

Create `src/components/EnvStore.js`:

```js
const fs = require('fs')
const dotenv = require('dotenv')

const FIELDS = [
  'TELEGRAM_TOKEN',
  'TELEGRAM_CHAT_ID',
  'OLX_URLS',
  'CRON_INTERVAL',
  'MAX_PAGES_PER_SEARCH',
  'UI_PORT',
  'UI_USERNAME',
  'UI_PASSWORD',
]

const DEFAULTS = {
  CRON_INTERVAL: '*/5 * * * *',
  MAX_PAGES_PER_SEARCH: '2',
  UI_PORT: '3000',
}

const renderEnvFile = (values) => `# Telegram — token do bot criado com o @BotFather e o chat ID do grupo/usuário
TELEGRAM_TOKEN=${values.TELEGRAM_TOKEN || ''}
TELEGRAM_CHAT_ID=${values.TELEGRAM_CHAT_ID || ''}

# URLs de busca da OLX que já vêm pré-cadastradas na primeira execução
# (depois disso, use a UI web pra gerenciar — essa env var só serve de seed inicial)
# separadas por vírgula, cada uma já com o filtro de preço (&pe=MAX&ps=MIN)
OLX_URLS=${values.OLX_URLS || ''}

# Frequência do cron (padrão: a cada 5 minutos)
CRON_INTERVAL=${values.CRON_INTERVAL || DEFAULTS.CRON_INTERVAL}

# Quantas páginas de resultado varrer por busca (padrão: 2)
MAX_PAGES_PER_SEARCH=${values.MAX_PAGES_PER_SEARCH || DEFAULTS.MAX_PAGES_PER_SEARCH}

# Porta da UI web (padrão: 3000)
UI_PORT=${values.UI_PORT || DEFAULTS.UI_PORT}

# Autenticação básica da UI web — deixe em branco pra desativar
UI_USERNAME=${values.UI_USERNAME || ''}
UI_PASSWORD=${values.UI_PASSWORD || ''}
`

const readEnv = (envPath) => {
  const parsed = fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath)) : {}
  const values = {}
  for (const key of FIELDS) {
    values[key] = parsed[key] !== undefined ? parsed[key] : (DEFAULTS[key] || '')
  }
  return values
}

const writeEnv = (envPath, values) => {
  const merged = { ...readEnv(envPath), ...values }
  const tmpPath = `${envPath}.tmp`
  fs.writeFileSync(tmpPath, renderEnvFile(merged))
  fs.renameSync(tmpPath, envPath)
  return merged
}

module.exports = { FIELDS, DEFAULTS, readEnv, writeEnv, renderEnvFile }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/EnvStore.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Create the `.env.example` template**

Create `src/.env.example` (used both as the repo's onboarding template and copied into the Windows build output):

```
# Telegram — token do bot criado com o @BotFather e o chat ID do grupo/usuário
TELEGRAM_TOKEN=
TELEGRAM_CHAT_ID=

# URLs de busca da OLX que já vêm pré-cadastradas na primeira execução
# (depois disso, use a UI web pra gerenciar — essa env var só serve de seed inicial)
# separadas por vírgula, cada uma já com o filtro de preço (&pe=MAX&ps=MIN)
OLX_URLS=

# Frequência do cron (padrão: a cada 5 minutos)
CRON_INTERVAL=*/5 * * * *

# Quantas páginas de resultado varrer por busca (padrão: 2)
MAX_PAGES_PER_SEARCH=2

# Porta da UI web (padrão: 3000)
UI_PORT=3000

# Autenticação básica da UI web — deixe em branco pra desativar
UI_USERNAME=
UI_PASSWORD=
```

- [ ] **Step 6: Commit**

```bash
git add src/components/EnvStore.js src/test/EnvStore.test.js src/.env.example
git commit -m "Add EnvStore for reading/writing the .env file with a fixed template"
```

---

### Task 3: Wire `RuntimePaths` into `config.js`, `database.js`, `Logger.js`

**Files:**
- Modify: `src/config.js` (all 17 lines)
- Modify: `src/database/database.js:1-10`
- Modify: `src/components/Logger.js:1-10`

**Interfaces:**
- Consumes: `RuntimePaths.getEnvPath()`, `RuntimePaths.getDataDir()`, `RuntimePaths.getAppDir()`, `RuntimePaths.isPackaged()` from Task 1.
- Produces: `config.dataDir: string` (replaces the old `config.dbFile` / `config.logger.logFilePath` fields — no other task or existing file references those old fields besides `database.js`/`Logger.js`, which this task updates directly).

This task is thin wiring over already-tested logic (Tasks 1 and 2) plus a module-load-time singleton (`config.js` calling `dotenv.config()`), which isn't practical to unit test without restructuring `config.js` into something injectable — out of scope for this feature. Verification here is a manual regression check, not an automated test.

- [ ] **Step 1: Update `config.js`**

Replace the full contents of `src/config.js`:

```js
const RuntimePaths = require('./components/RuntimePaths')
require('dotenv').config({ path: RuntimePaths.getEnvPath() })

let config = {}

config.urls = (process.env.OLX_URLS || '').split(',').map(u => u.trim()).filter(Boolean)

config.interval = process.env.CRON_INTERVAL || '*/5 * * * *'
config.telegramChatID = process.env.TELEGRAM_CHAT_ID
config.telegramToken = process.env.TELEGRAM_TOKEN
config.dataDir = RuntimePaths.getDataDir()

module.exports = config
```

- [ ] **Step 2: Update `database.js`**

Replace lines 1-10 of `src/database/database.js` (everything up to `const createTables = async () => {`):

```js
const path = require('path')
const config = require('../config')
const RuntimePaths = require('../components/RuntimePaths')

// require() com string calculada em runtime (não literal) para o pkg não
// tentar embutir o addon nativo do sqlite3 dentro do snapshot — ver Task 9.
const sqlite3ModuleName = RuntimePaths.isPackaged()
  ? path.join(RuntimePaths.getAppDir(), 'node_modules', 'sqlite3')
  : 'sqlite3'
const sqlite = require(sqlite3ModuleName).verbose()

const db = new sqlite.Database(
  path.join(config.dataDir, 'ads.db')
)
```

Leave `createTables` and `module.exports` (the rest of the file) unchanged.

- [ ] **Step 3: Update `Logger.js`**

Replace lines 1-10 of `src/components/Logger.js` (everything up to `const formatTimestamp`):

```js
const fs = require('fs')
const path = require('path')
const config = require('../config')

const logFilePath = path.join(config.dataDir, 'scrapper.log')
```

(`config.dataDir` already guarantees the directory exists via `RuntimePaths.getDataDir()`, so the old `fs.existsSync`/`mkdirSync` block is no longer needed here.)

Leave the rest of the file (`formatTimestamp`, `write`, `module.exports`) unchanged.

- [ ] **Step 4: Manual regression check**

Run (from `src/`): `npm run dev`
Expected: logs show `Program started` and `UI disponível na porta 3000`; `data/ads.db` and `data/scrapper.log` exist at the project root exactly as before this change. Stop with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add src/config.js src/database/database.js src/components/Logger.js
git commit -m "Resolve data dir, env path and sqlite3 module via RuntimePaths"
```

---

### Task 4: `CycleTls` — use the external binary when packaged

**Files:**
- Modify: `src/components/CycleTls.js` (all 22 lines)

**Interfaces:**
- Consumes: `RuntimePaths.isPackaged()`, `RuntimePaths.getBinDir()` from Task 1.
- Produces: no change to `initializeCycleTLS()`'s signature — `RunScraper.js`/`index.js` keep calling it exactly as before.

- [ ] **Step 1: Update `CycleTls.js`**

Replace the full contents of `src/components/CycleTls.js`:

```js
const initCycleTLS = require("cycletls")
const path = require('path')
const RuntimePaths = require('./RuntimePaths')

let cycleTLSInstance

async function initializeCycleTLS() {
  const options = RuntimePaths.isPackaged()
    ? { executablePath: path.join(RuntimePaths.getBinDir(), 'cycletls.exe') }
    : {}
  cycleTLSInstance = await initCycleTLS(options)
}

async function exitCycleTLS() {
  cycleTLSInstance.exit()
}

function getCycleTLSInstance() {
  return cycleTLSInstance
}

module.exports = {
  initializeCycleTLS,
  getCycleTLSInstance,
  exitCycleTLS,
}
```

- [ ] **Step 2: Manual regression check**

Run (from `src/`): `npm run dev`
Expected: no change in dev behavior — `RuntimePaths.isPackaged()` is `false`, so `initCycleTLS()` gets called with `{}`, same as before. Confirm the app still boots without errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/CycleTls.js
git commit -m "Point CycleTLS at the external sidecar binary when packaged"
```

---

### Task 5: `createApp()` refactor + `GET/POST /api/config`

**Files:**
- Modify: `src/components/Server.js`
- Test: `src/test/configApi.test.js`

**Interfaces:**
- Consumes: `EnvStore.readEnv`/`writeEnv` (Task 2), `RuntimePaths.getEnvPath` (Task 1), `cron.validate` (already a dependency, `node-cron`).
- Produces: `Server.createApp({ envPath } = {}): express.Express` (new export — builds the app without listening; defaults `envPath` to `RuntimePaths.getEnvPath()`), `Server.start(): http.Server` (unchanged behavior/signature for `index.js`, now implemented on top of `createApp()`).

`createApp()` takes an injectable `envPath` specifically so tests never touch the real `src/.env` (which holds a live Telegram token).

- [ ] **Step 1: Write the failing tests**

Create `src/test/configApi.test.js`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { createApp } = require('../components/Server')

const tempEnvPath = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'olx-config-api-')), '.env')

const withServer = async (envPath, run) => {
  const app = createApp({ envPath })
  const server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  const { port } = server.address()
  try {
    await run(`http://127.0.0.1:${port}`)
  } finally {
    server.close()
  }
}

test('GET /api/config returns defaults and boolean flags for secret fields', async () => {
  const envPath = tempEnvPath()
  await withServer(envPath, async (base) => {
    const res = await fetch(`${base}/api/config`)
    const body = await res.json()
    assert.equal(res.status, 200)
    assert.equal(body.TELEGRAM_TOKEN_SET, false)
    assert.equal(body.UI_PASSWORD_SET, false)
    assert.equal(body.UI_PORT, '3000')
    assert.equal('TELEGRAM_TOKEN' in body, false)
    assert.equal('UI_PASSWORD' in body, false)
  })
})

test('POST /api/config saves fields and GET reflects them', async () => {
  const envPath = tempEnvPath()
  await withServer(envPath, async (base) => {
    const post = await fetch(`${base}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ TELEGRAM_TOKEN: 'abc:123', UI_PORT: '4000' }),
    })
    assert.equal(post.status, 200)
    const postBody = await post.json()
    assert.equal(postBody.restartRequired, true)

    const get = await fetch(`${base}/api/config`)
    const getBody = await get.json()
    assert.equal(getBody.TELEGRAM_TOKEN_SET, true)
    assert.equal(getBody.UI_PORT, '4000')
  })
})

test('POST /api/config rejects an invalid cron expression', async () => {
  const envPath = tempEnvPath()
  await withServer(envPath, async (base) => {
    const res = await fetch(`${base}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ CRON_INTERVAL: 'not-a-cron' }),
    })
    assert.equal(res.status, 400)
  })
})

test('POST /api/config rejects a non-integer UI_PORT', async () => {
  const envPath = tempEnvPath()
  await withServer(envPath, async (base) => {
    const res = await fetch(`${base}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ UI_PORT: 'abc' }),
    })
    assert.equal(res.status, 400)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/configApi.test.js`
Expected: FAIL — `createApp` is not exported yet / route doesn't exist.

- [ ] **Step 3: Refactor `Server.js` and add the endpoints**

Replace the full contents of `src/components/Server.js`:

```js
const express = require('express')
const path = require('path')
const cron = require('node-cron')
const $logger = require('./Logger.js')
const searchUrlRepository = require('../repositories/searchUrlRepository.js')
const { runScraper, isScraperRunning } = require('./RunScraper.js')
const EnvStore = require('./EnvStore.js')
const RuntimePaths = require('./RuntimePaths.js')

const applyPriceParams = (rawUrl, maxPrice, minPrice) => {
    const url = new URL(rawUrl)
    if (maxPrice) url.searchParams.set('pe', maxPrice)
    if (minPrice) url.searchParams.set('ps', minPrice)
    return url.toString()
}

const basicAuth = (req, res, next) => {
    const user = process.env.UI_USERNAME
    const pass = process.env.UI_PASSWORD
    if (!user || !pass) return next() // sem credenciais configuradas = sem auth

    const [scheme, encoded] = (req.headers.authorization || '').split(' ')
    if (scheme === 'Basic' && encoded) {
        const [reqUser, reqPass] = Buffer.from(encoded, 'base64').toString().split(':')
        if (reqUser === user && reqPass === pass) return next()
    }
    res.set('WWW-Authenticate', 'Basic realm="olx-monitor"')
    return res.status(401).send('Autenticação necessária')
}

const createApp = ({ envPath = RuntimePaths.getEnvPath() } = {}) => {
    const app = express()
    app.use(express.json())
    app.use(basicAuth)
    app.use(express.static(path.join(__dirname, '../public')))

    app.get('/api/urls', async (req, res) => {
        try { res.json(await searchUrlRepository.getAllUrls()) }
        catch (error) { $logger.error(error); res.status(500).json({ error: 'Erro ao listar URLs' }) }
    })

    app.post('/api/urls', async (req, res) => {
        try {
            const { url, label, maxPrice, minPrice } = req.body
            if (!url) return res.status(400).json({ error: 'URL é obrigatória' })
            const finalUrl = applyPriceParams(url, maxPrice, minPrice)
            res.status(201).json(await searchUrlRepository.createUrl(finalUrl, label))
        } catch (error) { $logger.error(error); res.status(400).json({ error: 'URL inválida' }) }
    })

    app.patch('/api/urls/:id', async (req, res) => {
        try { await searchUrlRepository.setActive(req.params.id, req.body.active); res.json({ ok: true }) }
        catch (error) { $logger.error(error); res.status(500).json({ error: 'Erro ao atualizar URL' }) }
    })

    app.delete('/api/urls/:id', async (req, res) => {
        try { await searchUrlRepository.deleteUrl(req.params.id); res.json({ ok: true }) }
        catch (error) { $logger.error(error); res.status(500).json({ error: 'Erro ao remover URL' }) }
    })

    app.get('/api/scrape/status', (req, res) => {
        res.json({ running: isScraperRunning() })
    })

    app.post('/api/scrape/run', (req, res) => {
        if (isScraperRunning()) {
            return res.status(409).json({ error: 'Scraper já está rodando' })
        }

        res.json({ started: true })

        runScraper().catch((error) => $logger.error(error))
    })

    app.get('/api/config', (req, res) => {
        const values = EnvStore.readEnv(envPath)
        res.json({
            TELEGRAM_TOKEN_SET: !!values.TELEGRAM_TOKEN,
            TELEGRAM_CHAT_ID: values.TELEGRAM_CHAT_ID,
            CRON_INTERVAL: values.CRON_INTERVAL,
            MAX_PAGES_PER_SEARCH: values.MAX_PAGES_PER_SEARCH,
            UI_PORT: values.UI_PORT,
            UI_USERNAME: values.UI_USERNAME,
            UI_PASSWORD_SET: !!values.UI_PASSWORD,
        })
    })

    app.post('/api/config', (req, res) => {
        const body = req.body || {}
        const updates = {}

        if (typeof body.TELEGRAM_TOKEN === 'string' && body.TELEGRAM_TOKEN !== '') updates.TELEGRAM_TOKEN = body.TELEGRAM_TOKEN
        if (typeof body.TELEGRAM_CHAT_ID === 'string') updates.TELEGRAM_CHAT_ID = body.TELEGRAM_CHAT_ID
        if (typeof body.UI_USERNAME === 'string') updates.UI_USERNAME = body.UI_USERNAME
        if (typeof body.UI_PASSWORD === 'string' && body.UI_PASSWORD !== '') updates.UI_PASSWORD = body.UI_PASSWORD

        if (typeof body.CRON_INTERVAL === 'string') {
            if (!cron.validate(body.CRON_INTERVAL)) {
                return res.status(400).json({ error: 'Expressão de cron inválida' })
            }
            updates.CRON_INTERVAL = body.CRON_INTERVAL
        }

        if (body.MAX_PAGES_PER_SEARCH !== undefined) {
            const n = Number(body.MAX_PAGES_PER_SEARCH)
            if (!Number.isInteger(n) || n < 1) return res.status(400).json({ error: 'Páginas por busca deve ser um número inteiro positivo' })
            updates.MAX_PAGES_PER_SEARCH = String(n)
        }

        if (body.UI_PORT !== undefined) {
            const n = Number(body.UI_PORT)
            if (!Number.isInteger(n) || n < 1 || n > 65535) return res.status(400).json({ error: 'Porta inválida' })
            updates.UI_PORT = String(n)
        }

        EnvStore.writeEnv(envPath, updates)
        res.json({ ok: true, restartRequired: true })
    })

    return app
}

const start = () => {
    const app = createApp()
    const port = process.env.UI_PORT || 3000
    return app.listen(port, () => $logger.info(`UI disponível na porta ${port}`))
}

module.exports = { start, createApp }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/configApi.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Manual regression check**

Run (from `src/`): `npm run dev`, then in another terminal `curl http://localhost:3000/api/urls` — confirm the existing URL-management behavior is unaffected by the refactor.

- [ ] **Step 6: Commit**

```bash
git add src/components/Server.js src/test/configApi.test.js
git commit -m "Add GET/POST /api/config endpoints and extract createApp() for testing"
```

---

### Task 6: `RestartManager` + `POST /api/restart`

**Files:**
- Create: `src/components/RestartManager.js`
- Modify: `src/components/Server.js` (add the route inside `createApp()`, and the two new `require`s at the top)
- Test: `src/test/RestartManager.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks directly (used by `Server.js`).
- Produces: `scheduleRestart({ spawnFn, exitFn, execPath, args, cwd, delayMs }): void`.

- [ ] **Step 1: Write the failing test**

Create `src/test/RestartManager.test.js`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { scheduleRestart } = require('../components/RestartManager')

test('scheduleRestart spawns a detached copy of the process and exits', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const calls = []
  const spawnFn = (...args) => { calls.push(args); return { unref: () => {} } }
  let exitCode
  const exitFn = (code) => { exitCode = code }

  scheduleRestart({
    spawnFn,
    exitFn,
    execPath: 'C:\\Apps\\OlxMonitor\\OlxMonitor.exe',
    args: [],
    cwd: 'C:\\Apps\\OlxMonitor',
    delayMs: 300,
  })

  assert.equal(calls.length, 0)
  t.mock.timers.tick(300)

  assert.equal(calls.length, 1)
  const [execPath, args, options] = calls[0]
  assert.equal(execPath, 'C:\\Apps\\OlxMonitor\\OlxMonitor.exe')
  assert.deepEqual(args, [])
  assert.equal(options.detached, true)
  assert.equal(options.cwd, 'C:\\Apps\\OlxMonitor')
  assert.equal(exitCode, 0)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/RestartManager.test.js`
Expected: FAIL — `Cannot find module '../components/RestartManager'`

- [ ] **Step 3: Implement `RestartManager.js`**

Create `src/components/RestartManager.js`:

```js
const scheduleRestart = ({
  spawnFn,
  exitFn,
  execPath = process.execPath,
  args = process.argv.slice(1),
  cwd = process.cwd(),
  delayMs = 300,
}) => {
  setTimeout(() => {
    spawnFn(execPath, args, { detached: true, cwd, stdio: 'ignore' }).unref()
    exitFn(0)
  }, delayMs)
}

module.exports = { scheduleRestart }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/RestartManager.test.js`
Expected: PASS

- [ ] **Step 5: Wire the route into `Server.js`**

At the top of `src/components/Server.js`, add two requires next to the existing ones:

```js
const { spawn } = require('child_process')
const { scheduleRestart } = require('./RestartManager.js')
```

Inside `createApp()`, immediately after the `/api/config` POST route (before `return app`), add:

```js
    app.post('/api/restart', (req, res) => {
        res.json({ ok: true })
        scheduleRestart({ spawnFn: spawn, exitFn: process.exit })
    })
```

- [ ] **Step 6: Manual regression check**

Run (from `src/`): `npm run dev`, then `curl -X POST http://localhost:3000/api/restart` — confirm the response is `{"ok":true}` and the process exits shortly after (nodemon will restart it automatically in dev).

- [ ] **Step 7: Commit**

```bash
git add src/components/RestartManager.js src/components/Server.js src/test/RestartManager.test.js
git commit -m "Add self-restart endpoint so config changes can take effect without manual intervention"
```

---

### Task 7: `StartupManager` + `GET/POST/DELETE /api/startup`

**Files:**
- Create: `src/components/StartupManager.js`
- Modify: `src/components/Server.js`
- Test: `src/test/StartupManager.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `getVbsContent(exePath): string`, `escapeForVbs(value): string`, `getStartupFolder(env?): string`, `getShortcutPath(env?): string`, `isInstalled(env?): boolean`, `install(exePath, env?): void`, `uninstall(env?): void`. `env` defaults to `process.env` and is injectable purely for testing.

- [ ] **Step 1: Write the failing tests**

Create `src/test/StartupManager.test.js`:

```js
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

  const written = fs.readFileSync(getShortcutPath(env), 'utf8')
  assert.match(written, /OlxMonitor\.exe/)
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/StartupManager.test.js`
Expected: FAIL — `Cannot find module '../components/StartupManager'`

- [ ] **Step 3: Implement `StartupManager.js`**

Create `src/components/StartupManager.js`:

```js
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

const install = (exePath, env = process.env) => {
  const folder = getStartupFolder(env)
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(getShortcutPath(env), getVbsContent(exePath))
}

const uninstall = (env = process.env) => {
  const shortcutPath = getShortcutPath(env)
  if (fs.existsSync(shortcutPath)) fs.unlinkSync(shortcutPath)
}

module.exports = { getVbsContent, escapeForVbs, getStartupFolder, getShortcutPath, isInstalled, install, uninstall }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/StartupManager.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Wire the routes into `Server.js`**

At the top of `src/components/Server.js`, add:

```js
const StartupManager = require('./StartupManager.js')
```

Inside `createApp()`, after the `/api/restart` route (before `return app`), add:

```js
    app.get('/api/startup', (req, res) => {
        res.json({ installed: process.platform === 'win32' ? StartupManager.isInstalled() : false })
    })

    app.post('/api/startup', (req, res) => {
        if (process.platform !== 'win32') return res.status(400).json({ error: 'Recurso disponível apenas no Windows' })
        StartupManager.install(process.execPath)
        res.json({ installed: true })
    })

    app.delete('/api/startup', (req, res) => {
        if (process.platform !== 'win32') return res.status(400).json({ error: 'Recurso disponível apenas no Windows' })
        StartupManager.uninstall()
        res.json({ installed: false })
    })
```

- [ ] **Step 6: Manual regression check**

Run (from `src/`): `npm run dev`, then `curl http://localhost:3000/api/startup` — confirm `{"installed":false}` on macOS (since `process.platform !== 'win32'`), and that `curl -X POST http://localhost:3000/api/startup` returns HTTP 400 with the Portuguese error message.

- [ ] **Step 7: Commit**

```bash
git add src/components/StartupManager.js src/components/Server.js src/test/StartupManager.test.js
git commit -m "Add Windows Startup folder auto-start toggle"
```

---

### Task 8: "Configurações" tab in the web UI

**Files:**
- Modify: `src/public/index.html`

**Interfaces:**
- Consumes: `GET/POST /api/config` (Task 5), `POST /api/restart` (Task 6), `GET/POST/DELETE /api/startup` (Task 7).
- Produces: nothing consumed by later tasks — this is the last UI-facing piece.

No automated test framework exists for this vanilla-JS page today (the existing URL-management UI isn't unit tested either); verification is manual, in a browser.

- [ ] **Step 1: Add tab buttons and wrap the existing content**

In `src/public/index.html`, replace the line `<h1>🔍 OLX Monitor — URLs monitoradas</h1>` (line 21) and everything through the closing `</table>` (line 38) with:

```html
  <h1>🔍 OLX Monitor</h1>
  <div style="margin-bottom:16px;">
    <button id="tab-urls" onclick="showTab('urls')">URLs monitoradas</button>
    <button id="tab-config" onclick="showTab('config')">Configurações</button>
  </div>

  <div id="urls-view">
    <button id="run-now" style="margin-bottom:16px;">▶ Rodar agora</button>
    <span id="run-status" class="muted"></span>
    <form id="add-form">
      <input id="url" placeholder="Cole a URL de busca da OLX" required>
      <input id="label" placeholder="Rótulo (opcional, ex: iPhone 13)">
      <div class="price-row">
        <input id="maxPrice" type="number" placeholder="Preço máximo (opcional)">
        <input id="minPrice" type="number" placeholder="Preço mínimo (opcional)">
      </div>
      <button type="submit">Adicionar</button>
    </form>

    <table>
      <thead><tr><th>Ativo</th><th>Rótulo</th><th>URL</th><th></th></tr></thead>
      <tbody id="rows"></tbody>
    </table>
  </div>

  <div id="config-view" style="display:none;">
    <form id="config-form">
      <label>Token do bot do Telegram<br>
        <input id="cfg-token" placeholder="deixe em branco para manter o atual">
      </label>
      <label>Chat ID do Telegram<br>
        <input id="cfg-chat-id">
      </label>
      <label>Intervalo do cron (formato cron)<br>
        <input id="cfg-cron">
      </label>
      <label>Páginas por busca<br>
        <input id="cfg-max-pages" type="number" min="1">
      </label>
      <label>Porta da UI web<br>
        <input id="cfg-ui-port" type="number" min="1" max="65535">
      </label>
      <label>Usuário da UI web<br>
        <input id="cfg-ui-username">
      </label>
      <label>Senha da UI web<br>
        <input id="cfg-ui-password" placeholder="deixe em branco para manter a atual">
      </label>
      <button type="submit">Salvar</button>
    </form>
    <p id="config-status" class="muted"></p>
    <div id="restart-box" style="display:none;">
      <button id="restart-now" class="danger">Reiniciar agora para aplicar</button>
    </div>

    <h2 style="font-size:1.1rem;">Início automático com o Windows</h2>
    <p id="startup-status" class="muted"></p>
    <button id="startup-toggle"></button>
  </div>
```

- [ ] **Step 2: Add the tab-switching and config/startup logic**

In `src/public/index.html`, at the end of the existing `<script>` block (after the line `checkStatus()`, before `</script>`), add:

```js
function showTab(tab) {
  document.getElementById('urls-view').style.display = tab === 'urls' ? '' : 'none'
  document.getElementById('config-view').style.display = tab === 'config' ? '' : 'none'
  if (tab === 'config') { loadConfig(); loadStartupStatus() }
}

async function loadConfig() {
  const res = await fetch('/api/config')
  const cfg = await res.json()
  document.getElementById('cfg-token').placeholder = cfg.TELEGRAM_TOKEN_SET
    ? 'já configurado — deixe em branco para manter'
    : 'nenhum token configurado ainda'
  document.getElementById('cfg-chat-id').value = cfg.TELEGRAM_CHAT_ID || ''
  document.getElementById('cfg-cron').value = cfg.CRON_INTERVAL || ''
  document.getElementById('cfg-max-pages').value = cfg.MAX_PAGES_PER_SEARCH || ''
  document.getElementById('cfg-ui-port').value = cfg.UI_PORT || ''
  document.getElementById('cfg-ui-username').value = cfg.UI_USERNAME || ''
  document.getElementById('cfg-ui-password').placeholder = cfg.UI_PASSWORD_SET
    ? 'já configurada — deixe em branco para manter'
    : 'nenhuma senha configurada ainda'
}

document.getElementById('config-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const body = {
    TELEGRAM_TOKEN: document.getElementById('cfg-token').value,
    TELEGRAM_CHAT_ID: document.getElementById('cfg-chat-id').value,
    CRON_INTERVAL: document.getElementById('cfg-cron').value,
    MAX_PAGES_PER_SEARCH: document.getElementById('cfg-max-pages').value,
    UI_PORT: document.getElementById('cfg-ui-port').value,
    UI_USERNAME: document.getElementById('cfg-ui-username').value,
    UI_PASSWORD: document.getElementById('cfg-ui-password').value,
  }
  const res = await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const statusEl = document.getElementById('config-status')
  if (res.ok) {
    statusEl.textContent = 'Configurações salvas.'
    document.getElementById('restart-box').style.display = ''
    document.getElementById('cfg-token').value = ''
    document.getElementById('cfg-ui-password').value = ''
    loadConfig()
  } else {
    const { error } = await res.json()
    statusEl.textContent = 'Erro: ' + error
  }
})

document.getElementById('restart-now').addEventListener('click', async () => {
  document.getElementById('config-status').textContent = 'Reiniciando...'
  await fetch('/api/restart', { method: 'POST' })
  setTimeout(() => location.reload(), 3000)
})

async function loadStartupStatus() {
  const res = await fetch('/api/startup')
  const { installed } = await res.json()
  document.getElementById('startup-status').textContent = installed
    ? 'Início automático ativado.'
    : 'Início automático desativado.'
  const btn = document.getElementById('startup-toggle')
  btn.textContent = installed ? 'Desativar início automático' : 'Ativar início automático'
  btn.onclick = async () => {
    const res2 = await fetch('/api/startup', { method: installed ? 'DELETE' : 'POST' })
    if (res2.ok) {
      loadStartupStatus()
    } else {
      const { error } = await res2.json()
      document.getElementById('startup-status').textContent = error
    }
  }
}

showTab('urls')
```

- [ ] **Step 3: Manual verification in a browser**

Run (from `src/`): `npm run dev`, open `http://localhost:3000`.
- Click "Configurações" — form loads with current values, token/password fields show placeholders instead of real secrets.
- Change "Porta da UI web" to an invalid value (e.g. `0`) and submit — expect an inline error, no crash.
- Set a valid `CRON_INTERVAL` and submit — expect "Configurações salvas." and the "Reiniciar agora" button to appear.
- Click "Ativar início automático" — since this runs on macOS in dev, expect the inline error "Recurso disponível apenas no Windows" (proves the platform guard from Task 7 reaches the UI correctly).

- [ ] **Step 4: Commit**

```bash
git add src/public/index.html
git commit -m "Add Configurações tab to the web UI"
```

---

### Task 9: `pkg` build — package the Windows executable

**Files:**
- Modify: `src/package.json`
- Create: `src/scripts/build-win.js`

**Interfaces:**
- Consumes: everything from Tasks 1-7 (`RuntimePaths`, the dynamic `sqlite3` require in `database.js`, `CycleTls.js`'s `executablePath`).
- Produces: `src/dist-win/OlxMonitor/` — the distributable folder (git-ignored build output, not committed).

This is the task flagged in the spec as the top technical risk. The build itself (`npx pkg`) can run and be inspected on this macOS machine since `@yao-pkg/pkg` cross-compiles; **actually launching the resulting `.exe` can only be verified on a real Windows machine — that happens in Task 10, not here.**

- [ ] **Step 1: Add the `pkg` devDependency and config**

Edit `src/package.json`:
- Add `"bin": "index.js",` right after `"main": "index.js",`.
- Add to `"devDependencies"`: `"@yao-pkg/pkg": "^6.22.0"`.
- Add a top-level `"pkg"` key:

```json
  "pkg": {
    "assets": [
      "public/**/*"
    ],
    "targets": [
      "node20-win-x64"
    ]
  }
```

- Add to `"scripts"`: `"build:win": "node scripts/build-win.js"`.

`"assets": ["public/**/*"]` is required because `express.static` reads `public/index.html` via plain `fs` at request time — `pkg`'s static analyzer only auto-bundles files reached through a literal `require(...)`, so anything served as a static file has to be declared explicitly or the packaged app 404s on every page.

- [ ] **Step 2: Write the build script**

Create `src/scripts/build-win.js`:

```js
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
    ['pkg', '.', '--target', 'node20-win-x64', '--output', path.join(OUT_DIR, 'OlxMonitor.exe')],
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
```

- [ ] **Step 3: Install the new devDependency**

Run (from `src/`): `npm install`
Expected: `@yao-pkg/pkg` installed, `package-lock.json` updated.

- [ ] **Step 4: Run the build and inspect the output on this machine**

Run (from `src/`): `npm run build:win`

Expected: the script completes without throwing; check the console output from the `pkg` step for any warning naming `sqlite3` or `cycletls` (if `pkg` logs warnings about failing to resolve/bundle them, that's expected — we're intentionally keeping them external — but read the warnings to make sure nothing *else* unexpected is being skipped, e.g. `express`).

Then verify the output layout:

```bash
ls -la src/dist-win/OlxMonitor
ls -la src/dist-win/OlxMonitor/bin
ls -la src/dist-win/OlxMonitor/node_modules/sqlite3/build/Release
```

Expected: `OlxMonitor.exe`, `.env.example`, `bin/cycletls.exe`, and `node_modules/sqlite3/build/Release/node_sqlite3.node` all present. If `npx pkg` fails because `node20-win-x64` isn't a target `@yao-pkg/pkg` 6.22.0 actually ships, run `npx pkg --help` to see the currently supported target list and adjust the target string in both `package.json` and `build-win.js` accordingly — don't guess silently, note whatever the real supported target was in the commit message.

- [ ] **Step 5: Add build output to `.gitignore`**

Edit `.gitignore` (repo root) — add a line: `src/dist-win`

- [ ] **Step 6: Commit**

```bash
git add src/package.json src/package-lock.json src/scripts/build-win.js .gitignore
git commit -m "Add pkg-based Windows build script"
```

---

### Task 10: Windows manual verification + docs

**Files:**
- Create: `docs/windows-build-and-verify.md`
- Modify: `readme.md` (add a short pointer section)

This task has no automated component — its "test" is a human actually performing it on a Windows machine. Do not mark this done from macOS alone.

- [ ] **Step 1: Write the verification doc**

Create `docs/windows-build-and-verify.md`:

```markdown
# Build e verificação no Windows

## Gerar o executável

Na pasta `src/`, com Node.js instalado (só é necessário para *gerar* o
build — quem for só *rodar* o programa não precisa de Node):

```
npm install
npm run build:win
```

Isso cria `src/dist-win/OlxMonitor/`, com o `.exe`, os binários nativos e
um `.env.example`. Copie essa pasta inteira para a máquina Windows onde o
programa vai rodar (ou já rode o build direto nela).

## Checklist de verificação manual (rodar numa máquina Windows de verdade)

1. Copie/renomeie `.env.example` para `.env` dentro de `OlxMonitor/`.
2. Dê duplo clique em `OlxMonitor.exe`. Uma janela de console deve abrir
   nessa primeira vez manual — isso é esperado, o modo oculto só vale
   quando o programa é iniciado via `iniciar-oculto` (ver passo 6).
3. Confirme que apareceu `UI disponível na porta 3000` no console e que
   `data/ads.db` e `data/scrapper.log` foram criados dentro de
   `OlxMonitor/`.
4. Abra `http://localhost:3000` no navegador. Confirme que a aba "URLs
   monitoradas" carrega e que "Rodar agora" executa uma varredura sem
   erro (confirma que o `cycletls.exe` externo está funcionando).
5. Vá em "Configurações", preencha o token/chat ID do Telegram, salve, e
   clique em "Reiniciar agora" — confirme que o programa reinicia sozinho
   e a UI volta a responder em alguns segundos.
6. Clique em "Ativar início automático". Confirme que um arquivo
   `olx-monitor-autostart.vbs` aparece em
   `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup` (digite
   `shell:startup` na barra de endereços do Explorer para chegar lá).
7. Feche o `OlxMonitor.exe` (task manager, se preciso) e reinicie o
   Windows (ou faça logoff/login). Confirme que **nenhuma janela** abre,
   mas que `http://localhost:3000` volta a responder depois de alguns
   segundos — isso confirma que o `.vbs` está de fato iniciando o
   programa de forma oculta.
8. Clique em "Desativar início automático" e confirme que o `.vbs` some
   da pasta Startup.

Se qualquer passo falhar, anote o erro exato (mensagem, arquivo, linha)
antes de tentar corrigir — a causa mais provável é algo relacionado ao
empacotamento do `sqlite3`/`cycletls` (ver comentários em `database.js`,
`CycleTls.js` e `scripts/build-win.js`).
```

- [ ] **Step 2: Add a pointer section to the readme**

In `readme.md`, after the "Usando docker-compose" section (after line 34, before "### Configuração do Telegram"), add:

```markdown
### Rodando como executável do Windows

Para instalar sem precisar de Node.js, gerar um `.exe` que inicia junto
com o Windows e configurar tudo (incluindo o token do Telegram) pela
própria UI web, veja
[`docs/windows-build-and-verify.md`](docs/windows-build-and-verify.md).
```

- [ ] **Step 3: Commit**

```bash
git add docs/windows-build-and-verify.md readme.md
git commit -m "Document the Windows build and manual verification checklist"
```

---

## Post-plan follow-up (not a task — flag to the user, don't do it silently)

`src/.env` has a real Telegram bot token committed to git history. Suggest revoking/regenerating it via @BotFather once this plan lands, independent of this feature.
