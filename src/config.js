const fs = require('fs')
const RuntimePaths = require('./components/RuntimePaths')
const EnvStore = require('./components/EnvStore')

// O .env é a única fonte de verdade: lido direto do disco (nunca via
// process.env), porque o processo reiniciado herda o env do processo pai
// e veria valores antigos se dependesse do dotenv.config().
const envPath = RuntimePaths.getEnvPath()
if (!fs.existsSync(envPath)) {
  EnvStore.writeEnv(envPath, {})
}
const env = EnvStore.readEnv(envPath)

let config = {}

config.urls = (env.OLX_URLS || '').split(',').map(u => u.trim()).filter(Boolean)

config.interval = env.CRON_INTERVAL || '*/5 * * * *'
config.telegramChatID = env.TELEGRAM_CHAT_ID
config.telegramToken = env.TELEGRAM_TOKEN
config.maxPagesPerSearch = parseInt(env.MAX_PAGES_PER_SEARCH || '2', 10)
config.dataDir = RuntimePaths.getDataDir()

module.exports = config
