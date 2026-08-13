const $logger = require('./Logger')
const { scraper } = require('./Scraper')
const searchUrlRepository = require('../repositories/searchUrlRepository.js')

let running = false

const isScraperRunning = () => running

const runScraper = async () => {
    if (running) {
        $logger.info('Scraper já está rodando, ignorando chamada duplicada.')
        return { skipped: true }
    }

    running = true
    $logger.info('Iniciando varredura manual/agendada')

    try {
        const activeUrls = await searchUrlRepository.getActiveUrls()

        for (let i = 0; i < activeUrls.length; i++) {
            try {
                await scraper(activeUrls[i].url)
            } catch (error) {
                $logger.error(error)
            }
        }

        $logger.info('Varredura concluída')
        return { skipped: false, urlsChecked: activeUrls.length }
    } finally {
        running = false
    }
}

module.exports = { runScraper, isScraperRunning }
