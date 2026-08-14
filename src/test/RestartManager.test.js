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
