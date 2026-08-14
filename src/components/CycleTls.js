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
