const RuntimePaths = require('./components/RuntimePaths')
require('dotenv').config({ path: RuntimePaths.getEnvPath() })

let config = {}

config.urls = (process.env.OLX_URLS || '').split(',').map(u => u.trim()).filter(Boolean)

config.interval = process.env.CRON_INTERVAL || '*/5 * * * *'
config.telegramChatID = process.env.TELEGRAM_CHAT_ID
config.telegramToken = process.env.TELEGRAM_TOKEN
config.dataDir = RuntimePaths.getDataDir()

module.exports = config
