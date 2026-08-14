const express = require('express')
const path = require('path')
const cron = require('node-cron')
const { spawn } = require('child_process')
const $logger = require('./Logger.js')
const searchUrlRepository = require('../repositories/searchUrlRepository.js')
const { runScraper, isScraperRunning } = require('./RunScraper.js')
const EnvStore = require('./EnvStore.js')
const RuntimePaths = require('./RuntimePaths.js')
const { scheduleRestart } = require('./RestartManager.js')

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

const createApp = ({ envPath = RuntimePaths.getEnvPath() } = {}) => {
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

    app.get('/api/config', (req, res) => {
        const values = EnvStore.readEnv(envPath)
        res.json({
            TELEGRAM_TOKEN_SET: !!values.TELEGRAM_TOKEN,
            TELEGRAM_CHAT_ID: values.TELEGRAM_CHAT_ID,
            CRON_INTERVAL: values.CRON_INTERVAL,
            MAX_PAGES_PER_SEARCH: values.MAX_PAGES_PER_SEARCH,
            UI_PORT: values.UI_PORT,
            UI_USERNAME: values.UI_USERNAME,
            UI_PASSWORD_SET: !!values.UI_PASSWORD,
        })
    })

    app.post('/api/config', (req, res) => {
        const body = req.body || {}
        const updates = {}

        if (typeof body.TELEGRAM_TOKEN === 'string' && body.TELEGRAM_TOKEN !== '') updates.TELEGRAM_TOKEN = body.TELEGRAM_TOKEN
        if (typeof body.TELEGRAM_CHAT_ID === 'string') updates.TELEGRAM_CHAT_ID = body.TELEGRAM_CHAT_ID
        if (typeof body.UI_USERNAME === 'string') updates.UI_USERNAME = body.UI_USERNAME
        if (typeof body.UI_PASSWORD === 'string' && body.UI_PASSWORD !== '') updates.UI_PASSWORD = body.UI_PASSWORD

        if (typeof body.CRON_INTERVAL === 'string') {
            if (!cron.validate(body.CRON_INTERVAL)) {
                return res.status(400).json({ error: 'Expressão de cron inválida' })
            }
            updates.CRON_INTERVAL = body.CRON_INTERVAL
        }

        if (body.MAX_PAGES_PER_SEARCH !== undefined) {
            const n = Number(body.MAX_PAGES_PER_SEARCH)
            if (!Number.isInteger(n) || n < 1) return res.status(400).json({ error: 'Páginas por busca deve ser um número inteiro positivo' })
            updates.MAX_PAGES_PER_SEARCH = String(n)
        }

        if (body.UI_PORT !== undefined) {
            const n = Number(body.UI_PORT)
            if (!Number.isInteger(n) || n < 1 || n > 65535) return res.status(400).json({ error: 'Porta inválida' })
            updates.UI_PORT = String(n)
        }

        EnvStore.writeEnv(envPath, updates)
        res.json({ ok: true, restartRequired: true })
    })

    app.post('/api/restart', (req, res) => {
        res.json({ ok: true })
        scheduleRestart({ spawnFn: spawn, exitFn: process.exit })
    })

    return app
}

const start = () => {
    const app = createApp()
    const port = process.env.UI_PORT || 3000
    return app.listen(port, () => $logger.info(`UI disponível na porta ${port}`))
}

module.exports = { start, createApp }
