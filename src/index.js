// Primeiro de tudo, antes de qualquer require que possa estourar: em modo
// empacotado/oculto não existe console visível, então sem isso uma falha de
// boot é completamente invisível e indiagnosticável.
const path = require("path")
const fs = require("fs")
const RuntimePaths = require("./components/RuntimePaths")

const logCrash = (error) => {
  try {
    const crashLogPath = path.join(RuntimePaths.getAppDir(), 'crash.log')
    fs.appendFileSync(crashLogPath, `${new Date().toISOString()} ${error.stack || error.message}\n`)
  } catch (_) {
    // se nem isso funcionar, não há mais nada a fazer
  }
  process.exit(1)
}

process.on('uncaughtException', logCrash)
process.on('unhandledRejection', logCrash)

const config = require("./config")
const cron = require("node-cron")
const { initializeCycleTLS } = require("./components/CycleTls")
const $logger = require("./components/Logger")
const { createTables } = require("./database/database.js")
const searchUrlRepository = require("./repositories/searchUrlRepository.js")
const { runScraper } = require("./components/RunScraper.js")
const server = require("./components/Server.js")

const seedUrlsFromEnv = async () => {
  const existing = await searchUrlRepository.countUrls()
  if (existing > 0) return

  for (const url of config.urls) {
    try {
      await searchUrlRepository.createUrl(url, null)
    } catch (error) {
      $logger.error(error)
    }
  }
}

const main = async () => {
  $logger.info("Program started")
  await createTables()
  await seedUrlsFromEnv()
  await initializeCycleTLS()
  server.start()
  runScraper()
}

main().catch(logCrash)

cron.schedule(config.interval, () => {
  runScraper()
})
