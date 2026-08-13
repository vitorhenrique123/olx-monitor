const express = require('express')
const path = require('path')
const $logger = require('./Logger.js')
const searchUrlRepository = require('../repositories/searchUrlRepository.js')
const { runScraper, isScraperRunning } = require('./RunScraper.js')

const applyPriceParams = (rawUrl, maxPrice, minPrice) => {
    const url = new URL(rawUrl)
    if (maxPrice) url.searchParams.set('pe', maxPrice)
    if (minPrice) url.searchParams.set('ps', minPrice)
    return url.toString()
}

const basicAuth = (req, res, next) => {
    const user = process.env.UI_USERNAME
    const pass = process.env.UI_PASSWORD
    if (!user || !pass) return next() // sem credenciais configuradas = sem auth

    const [scheme, encoded] = (req.headers.authorization || '').split(' ')
    if (scheme === 'Basic' && encoded) {
        const [reqUser, reqPass] = Buffer.from(encoded, 'base64').toString().split(':')
        if (reqUser === user && reqPass === pass) return next()
    }
    res.set('WWW-Authenticate', 'Basic realm="olx-monitor"')
    return res.status(401).send('Autenticação necessária')
}

const start = () => {
    const app = express()
    app.use(express.json())
    app.use(basicAuth)
    app.use(express.static(path.join(__dirname, '../public')))

    app.get('/api/urls', async (req, res) => {
        try { res.json(await searchUrlRepository.getAllUrls()) }
        catch (error) { $logger.error(error); res.status(500).json({ error: 'Erro ao listar URLs' }) }
    })

    app.post('/api/urls', async (req, res) => {
        try {
            const { url, label, maxPrice, minPrice } = req.body
            if (!url) return res.status(400).json({ error: 'URL é obrigatória' })
            const finalUrl = applyPriceParams(url, maxPrice, minPrice)
            res.status(201).json(await searchUrlRepository.createUrl(finalUrl, label))
        } catch (error) { $logger.error(error); res.status(400).json({ error: 'URL inválida' }) }
    })

    app.patch('/api/urls/:id', async (req, res) => {
        try { await searchUrlRepository.setActive(req.params.id, req.body.active); res.json({ ok: true }) }
        catch (error) { $logger.error(error); res.status(500).json({ error: 'Erro ao atualizar URL' }) }
    })

    app.delete('/api/urls/:id', async (req, res) => {
        try { await searchUrlRepository.deleteUrl(req.params.id); res.json({ ok: true }) }
        catch (error) { $logger.error(error); res.status(500).json({ error: 'Erro ao remover URL' }) }
    })
    app.get('/api/scrape/status', (req, res) => {
        res.json({ running: isScraperRunning() })
    })

    app.post('/api/scrape/run', (req, res) => {
        if (isScraperRunning()) {
            return res.status(409).json({ error: 'Scraper já está rodando' })
        }

        res.json({ started: true })

        runScraper().catch((error) => $logger.error(error))
    })

    const port = process.env.UI_PORT || 3000
    app.listen(port, () => $logger.info(`UI disponível na porta ${port}`))
}

module.exports = { start }
