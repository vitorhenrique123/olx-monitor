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
