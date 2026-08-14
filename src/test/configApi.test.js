const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { createApp } = require('../components/Server')
const { writeEnv } = require('../components/EnvStore')

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

test('basicAuth reads credentials from the injected envPath, not real process.env', async () => {
  const envPath = tempEnvPath()
  writeEnv(envPath, { UI_USERNAME: 'admin', UI_PASSWORD: 'secret' })
  await withServer(envPath, async (base) => {
    const unauthed = await fetch(`${base}/api/urls`)
    assert.equal(unauthed.status, 401)

    const authed = await fetch(`${base}/api/urls`, {
      headers: { Authorization: 'Basic ' + Buffer.from('admin:secret').toString('base64') }
    })
    assert.equal(authed.status, 200)
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
