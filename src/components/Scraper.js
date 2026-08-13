const cheerio = require('cheerio')
const $logger = require('./Logger')
const $httpClient = require('./HttpClient.js')
const scraperRepository = require('../repositories/scrapperRepository.js')

const Ad = require('./Ad.js');

let page = 1
let maxPrice = 0
let minPrice = 99999999
let sumPrices = 0
let validAds = 0
let adsFound = 0
let nextPage = true

const scraper = async (url) => {
    page = 1
    maxPrice = 0
    minPrice = 99999999
    sumPrices = 0
    adsFound = 0
    validAds = 0
    nextPage = true

    const parsedUrl = new URL(url)
    const searchTerm = parsedUrl.searchParams.get('q') || ''
    const notify = await urlAlreadySearched(url)
    $logger.info(`Will notify: ${notify}`)

    do {
        currentUrl = setUrlParam(url, 'o', page)
        let response
        try {
            response        = await $httpClient(currentUrl)
            const $         = cheerio.load(response)
            nextPage        = await scrapePage($, searchTerm, notify, url)
        } catch (error) {
            $logger.error(error)
            return
        }
        page++

    } while (nextPage);

    $logger.info('Valid ads: ' + validAds)

    if (validAds) {
        const averagePrice = sumPrices / validAds;

        $logger.info('Maximum price: ' + maxPrice)
        $logger.info('Minimum price: ' + minPrice)
        $logger.info('Average price: ' + sumPrices / validAds)

        const scrapperLog = {
            url,
            adsFound: validAds,
            averagePrice,
            minPrice,
            maxPrice,
        }

        await scraperRepository.saveLog(scrapperLog)
    }
}

const scrapePage = async ($, searchTerm, notify) => {
    try {
        const script = $('script[id="__NEXT_DATA__"]').text()
        let adList

        if (script) {
            adList = JSON.parse(script).props.pageProps.ads
        } else {
            const flightScript = $('script:not([src])').toArray()
                .map(element => $(element).text())
                .find(script => script.includes('listId'))

            if (!flightScript) {
                const html = $.html()
                $logger.error(`Não encontrei dados de anúncios na página (nem __NEXT_DATA__ nem flight script). Tamanho do HTML: ${html.length} caracteres.`)
                $logger.error(`Trecho do HTML retornado: ${html.slice(0, 800)}`)
                return false
            }

            const pushMatch = flightScript.match(/^self\.__next_f\.push\((.*)\)\s*$/s)
            if (!pushMatch) {
                $logger.error('Script de flight data encontrado, mas em formato inesperado (regex do push não bateu).')
                return false
            }

            const payload = JSON.parse(pushMatch[1])[1]
            const adsMatch = payload.match(/"ads":(\[.*\]),"searchBoxProps":/s)
            if (!adsMatch) {
                $logger.error('Payload de flight data encontrado, mas sem o campo "ads" esperado.')
                return false
            }

            adList = JSON.parse(adsMatch[1])
        }

        if (!Array.isArray(adList) || !adList.length ) {
            return false
        }

        adsFound += adList.length

        $logger.info(`Checking new ads for: ${searchTerm}`)
        $logger.info('Ads found: ' + adsFound)

        for (let i = 0; i < adList.length; i++) {

            $logger.debug('Checking ad: ' + (i + 1))

            const advert = adList[i]
            const title = advert.subject
            const id = advert.listId
            const url = advert.url
            const rawPrice = advert.price ?? advert.priceValue ?? '0'
            const price = parseInt(String(rawPrice).replace(/\D/g, '') || '0')

            const result = {
                id,
                url,
                title,
                searchTerm,
                price,
                notify
            }

            const ad = new Ad(result)
            await ad.process()

            if (ad.valid) {
                validAds++
                minPrice = checkMinPrice(ad.price, minPrice)
                maxPrice = checkMaxPrice(ad.price, maxPrice)
                sumPrices += ad.price
            }
        }

        return true
    } catch (error) {
        $logger.error(error);
        throw new Error('Scraping failed');
    }
}

const urlAlreadySearched = async (url) => {
    try {
        const ad = await scraperRepository.getLogsByUrl(url, 1)
        if (ad.length) {
            return true
        }
        $logger.info('First run, no notifications')
        return false
    } catch (error) {
        $logger.error(error)
        return false
    }
}

const setUrlParam = (url, param, value) => {
    const newUrl = new URL(url)
    let searchParams = newUrl.searchParams;
    searchParams.set(param, value);
    newUrl.search = searchParams.toString();
    return newUrl.toString();
}

const checkMinPrice = (price, minPrice) => {
    if (price < minPrice) return price
    else return minPrice
}

const checkMaxPrice = (price, maxPrice) => {
    if (price > maxPrice) return price
    else return maxPrice
}

module.exports = {
    scraper
}
