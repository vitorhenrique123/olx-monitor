const fs = require('fs')
const dotenv = require('dotenv')

const FIELDS = [
  'TELEGRAM_TOKEN',
  'TELEGRAM_CHAT_ID',
  'OLX_URLS',
  'CRON_INTERVAL',
  'MAX_PAGES_PER_SEARCH',
  'UI_PORT',
  'UI_USERNAME',
  'UI_PASSWORD',
]

const DEFAULTS = {
  CRON_INTERVAL: '*/5 * * * *',
  MAX_PAGES_PER_SEARCH: '2',
  UI_PORT: '3000',
}

const renderEnvFile = (values) => `# Telegram — token do bot criado com o @BotFather e o chat ID do grupo/usuário
TELEGRAM_TOKEN=${values.TELEGRAM_TOKEN || ''}
TELEGRAM_CHAT_ID=${values.TELEGRAM_CHAT_ID || ''}

# URLs de busca da OLX que já vêm pré-cadastradas na primeira execução
# (depois disso, use a UI web pra gerenciar — essa env var só serve de seed inicial)
# separadas por vírgula, cada uma já com o filtro de preço (&pe=MAX&ps=MIN)
OLX_URLS=${values.OLX_URLS || ''}

# Frequência do cron (padrão: a cada 5 minutos)
CRON_INTERVAL=${values.CRON_INTERVAL || DEFAULTS.CRON_INTERVAL}

# Quantas páginas de resultado varrer por busca (padrão: 2)
MAX_PAGES_PER_SEARCH=${values.MAX_PAGES_PER_SEARCH || DEFAULTS.MAX_PAGES_PER_SEARCH}

# Porta da UI web (padrão: 3000)
UI_PORT=${values.UI_PORT || DEFAULTS.UI_PORT}

# Autenticação básica da UI web — deixe em branco pra desativar
UI_USERNAME=${values.UI_USERNAME || ''}
UI_PASSWORD=${values.UI_PASSWORD || ''}
`

const readEnv = (envPath) => {
  const parsed = fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath)) : {}
  const values = {}
  for (const key of FIELDS) {
    values[key] = parsed[key] !== undefined ? parsed[key] : (DEFAULTS[key] || '')
  }
  return values
}

const writeEnv = (envPath, values) => {
  const merged = { ...readEnv(envPath), ...values }
  const tmpPath = `${envPath}.tmp`
  fs.writeFileSync(tmpPath, renderEnvFile(merged))
  fs.renameSync(tmpPath, envPath)
  return merged
}

module.exports = { FIELDS, DEFAULTS, readEnv, writeEnv, renderEnvFile }
