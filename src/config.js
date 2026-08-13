require('dotenv').config()

let config = {}

config.urls = (process.env.OLX_URLS || '').split(',').map(u => u.trim()).filter(Boolean)

config.interval = process.env.CRON_INTERVAL || '*/5 * * * *'
config.telegramChatID = process.env.TELEGRAM_CHAT_ID
config.telegramToken = process.env.TELEGRAM_TOKEN
config.dbFile = '../data/ads.db'

config.logger = {
    logFilePath: '../data/scrapper.log',
    timestampFormat: 'YYYY-MM-DD HH:mm:ss'
}

module.exports = config
