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

main()

cron.schedule(config.interval, () => {
  runScraper()
})
