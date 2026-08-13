const fs = require('fs')
const path = require('path')
const config = require('../config')

const logFilePath = path.join(__dirname, '../', config.logger.logFilePath)
const logDir = path.dirname(logFilePath)

if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
}

const formatTimestamp = () => {
    const d = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const write = (level, args) => {
    const message = args
        .map((a) => {
            if (a instanceof Error) return a.stack || a.message
            return typeof a === 'string' ? a : JSON.stringify(a)
        })
        .join(' ')
    const line = `${formatTimestamp()} ${level.toUpperCase().padEnd(5)} ${message}`

    console.log(line)

    try {
        fs.appendFileSync(logFilePath, line + '\n')
    } catch (error) {
        console.error('Não foi possível escrever no arquivo de log:', error.message)
    }
}

module.exports = {
    info: (...args) => write('info', args),
    debug: (...args) => write('debug', args),
    warn: (...args) => write('warn', args),
    error: (...args) => write('error', args),
}
