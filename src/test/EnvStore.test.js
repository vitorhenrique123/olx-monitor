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
