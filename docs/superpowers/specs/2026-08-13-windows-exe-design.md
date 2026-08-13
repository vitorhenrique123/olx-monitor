# OLX Monitor — Executável Windows com auto-start e configuração via UI

## Contexto

O OLX Monitor hoje é um app Node.js (Express + `node-cron` + `sqlite3` + `cycletls`)
que roda via `node index.js`, exige Node.js/npm instalados, e é configurado
editando `.env`/`config.js` manualmente. Já existe uma UI web mínima
(`src/public/index.html` + `src/components/Server.js`) para gerenciar as URLs
monitoradas e disparar uma varredura manual.

Objetivo: transformar isso num programa que uma pessoa sem conhecimento técnico
possa instalar no Windows, que inicie sozinho com o Windows, rode em segundo
plano sem janela visível, e cuja configuração (token do Telegram, intervalo,
porta, etc.) seja feita pela própria UI web já existente — sem precisar editar
arquivos `.env` na mão.

## Decisões já validadas com o usuário

- **Standalone**: o `.exe` final não deve exigir Node.js instalado na máquina
  de destino.
- **Oculto**: depois de iniciar, não deve aparecer nenhuma janela de console.
  Interação é 100% via navegador (`http://localhost:3000` por padrão).
- **Configuração**: nova seção "Configurações" na UI web já existente (mesma
  página onde as URLs são gerenciadas), não uma janela desktop separada.
- **Auto-start**: atalho na pasta Startup do usuário (`shell:startup`), não
  serviço do Windows — evita exigir privilégios de administrador.

## Risco técnico principal (validar antes do resto)

`sqlite3` é um addon nativo (`.node` compilado) e `cycletls` já hoje spawna um
binário sidecar próprio (`node_modules/cycletls/dist/index.exe`) e se comunica
com ele via IPC/websocket local. Nenhum dos dois pode viver dentro do
snapshot virtual do `pkg`. Por isso o "executável" final é, na prática, uma
**pasta de distribuição** (exe + alguns arquivos de suporte ao lado), não um
único arquivo portátil que roda de qualquer lugar sozinho.

Antes de construir o resto (UI de config, instalador de startup), a primeira
etapa do plano de implementação deve ser um build mínimo de validação:
empacotar o app atual com `pkg`, copiar os binários nativos para uma pasta
`bin/` ao lado do `.exe`, ajustar a resolução de caminho desses binários em
runtime, e confirmar que o app sobe, conecta no sqlite e roda uma varredura
via cycletls a partir do `.exe` gerado (fora do repo, numa pasta limpa,
simulando a máquina de um usuário final). Se isso não funcionar de forma
razoável, o design é reavaliado antes de prosseguir.

## Arquitetura

### 1. Empacotamento (`pkg`)

- Ferramenta: `@yao-pkg/pkg` (fork mantido do `vercel/pkg`, que está
  arquivado/sem manutenção).
- Target: `node18-win-x64` (ou versão LTS mais recente suportada pelo pkg).
- Native assets tratados como arquivos externos, **não** embutidos no
  snapshot do pkg:
  - `sqlite3`: o binário `.node` compilado (de
    `node_modules/sqlite3/build/Release/node_sqlite3.node` ou equivalente
    prebuilt) é copiado para `bin/node_sqlite3.node` na pasta de saída.
  - `cycletls`: o binário sidecar (`node_modules/cycletls/dist/index.exe`) é
    copiado para `bin/cycletls.exe` na pasta de saída.
- Resolução de caminho em runtime: código novo (provavelmente em
  `src/config.js` ou um novo `src/components/RuntimePaths.js`) detecta
  `process.pkg` — quando presente, resolve os caminhos desses binários
  relativos a `path.dirname(process.execPath)` (a pasta onde o `.exe` está);
  quando ausente (modo dev normal via `node index.js`), usa os caminhos
  padrão de `node_modules`. `sqlite3` e `cycletls` precisam aceitar caminho
  customizado do binário — checar as opções de cada lib (`cycletls` aceita
  passar caminho do executável na inicialização; `sqlite3` carrega o
  `.node` via `bindings`/`require`, então pode precisar de um pequeno shim
  que troca o `require` padrão pelo caminho externo quando empacotado).
- Script de build (`npm run build:win` ou similar, em `src/package.json`)
  que roda o `pkg`, cria a pasta de saída (ex.: `dist-win/OlxMonitor/`), copia
  os binários nativos, copia `.env.example`, e gera o `iniciar-oculto.vbs`
  (ver seção 2).
- Saída final distribuível:
  ```
  OlxMonitor/
    OlxMonitor.exe
    bin/
      node_sqlite3.node
      cycletls.exe
    data/            (criado no primeiro uso: ads.db, scrapper.log)
    .env             (criado no primeiro uso a partir de um template, se não existir)
    iniciar-oculto.vbs
  ```

### 2. Execução oculta + auto-start

- `iniciar-oculto.vbs`: script gerado no build (texto estático, sem
  dependência de build-time), com o conteúdo equivalente a:
  ```vbs
  Set WshShell = CreateObject("WScript.Shell")
  WshShell.Run """" & WshShell.CurrentDirectory & "\OlxMonitor.exe""", 0, False
  ```
  Rodar via `wscript.exe` (associação padrão de `.vbs` no Windows) não abre
  nenhuma janela (o `0` no `.Run` é o window style oculto).
- Auto-start: na primeira execução bem-sucedida (ou via botão explícito
  "Ativar início automático com o Windows" na aba Configurações), o programa
  copia o `iniciar-oculto.vbs` para
  `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\`. Isso não exige
  privilégio de administrador (é a pasta Startup do usuário atual, não a
  global). Deve haver também um jeito de desativar (botão "Desativar início
  automático" remove o arquivo copiado).
- Sem serviço do Windows, sem `node-windows`, sem alterações de registro.

### 3. Aba "Configurações" na UI web

- Estende `src/public/index.html` (mesma página do gerenciamento de URLs)
  com uma nova seção/aba "Configurações" contendo campos para:
  `TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID`, `CRON_INTERVAL`,
  `MAX_PAGES_PER_SEARCH`, `UI_PORT`, `UI_USERNAME`, `UI_PASSWORD`.
- Backend novo em `src/components/Server.js`:
  - `GET /api/config`: retorna os valores atuais do `.env` (token pode vir
    parcialmente mascarado na resposta, ex. `123456:AAHi...`, já que a UI
    roda sem HTTPS local).
  - `POST /api/config`: valida e regrava o arquivo `.env` (reescreve o
    arquivo inteiro a partir de um template com comentários fixos —
    igual ao `.env` atual — preenchendo os valores recebidos).
- Depois de salvar, a resposta indica quais campos exigem reinício para
  valer (praticamente todos, já que `config.js` só lê `process.env` uma vez
  no boot). A UI mostra um aviso "Reinicie para aplicar" com um botão
  "Reiniciar agora".
- "Reiniciar agora": endpoint `POST /api/restart` que faz
  `spawn(process.execPath, process.argv.slice(1), { detached: true, cwd, stdio: 'ignore' }).unref()`
  seguido de `res.json({ ok: true })` e, com um pequeno delay, `process.exit(0)`.
  Funciona tanto empacotado (`process.execPath` é o próprio `.exe`) quanto em
  dev.
- Autenticação básica (`UI_USERNAME`/`UI_PASSWORD`) já existente continua
  valendo para todas as rotas, incluindo as novas — se o usuário configurar
  usuário/senha, precisa deles para acessar a própria aba de Configurações
  depois (ok, comportamento esperado).

## Fora de escopo (YAGNI)

- Ícone de bandeja do sistema (system tray) — não pedido, e exigiria
  ferramentas nativas adicionais (Electron ou binding nativo) que aumentam
  bastante a complexidade do empacotamento. Acesso via navegador é
  suficiente.
- Instalador `.msi`/`NSIS` com wizard gráfico — a "pasta de distribuição"
  zipada é suficiente para o caso de uso atual (o próprio programa se
  registra no Startup).
- Migrar `sqlite3` para uma alternativa pura-JS — mantido como está; o
  empacotamento lida com o binário nativo em vez de evitar a dependência.
- Suporte a outros SOs (Linux/macOS) no build — fora do pedido, que é
  especificamente Windows.

## Observação de segurança (não faz parte do escopo desta mudança)

O arquivo `src/.env` versionado no repositório contém um token real de bot do
Telegram. Recomendo revogar/gerar um novo token no BotFather e remover o
arquivo do histórico do git — isso é independente deste trabalho de
empacotamento, mas vale ser feito.
