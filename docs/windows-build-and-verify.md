# Build e verificação no Windows

## Gerar o executável

Na pasta `src/`, com Node.js instalado (só é necessário para *gerar* o
build — quem for só *rodar* o programa não precisa de Node):

```
npm install
npm run build:win
```

Isso cria `src/dist-win/OlxMonitor/`, com o `.exe`, os binários nativos e
um `.env.example`. Copie essa pasta inteira para a máquina Windows onde o
programa vai rodar (ou já rode o build direto nela).

## Checklist de verificação manual (rodar numa máquina Windows de verdade)

1. O arquivo `.env` é criado automaticamente (com valores em branco) na
   primeira vez que o programa roda, caso não exista. Você pode editar os
   valores depois pela própria aba Configurações da UI web, sem precisar
   mexer no arquivo diretamente (o `.env.example` fica na pasta só como
   referência do que cada campo significa).
2. Dê duplo clique em `OlxMonitor.exe`. Uma janela de console deve abrir
   nessa primeira vez manual — isso é esperado. O modo oculto (sem janela)
   só vale quando o programa é iniciado automaticamente pelo Windows,
   depois que você clicar em "Ativar início automático" na aba
   Configurações (ver passo 6) — esse botão gera um pequeno script `.vbs`
   que sempre aponta para o caminho correto do `.exe`, mesmo que você mova
   a pasta depois.
3. Confirme que apareceu `UI disponível na porta 3000` no console e que
   `data/ads.db` e `data/scrapper.log` foram criados dentro de
   `OlxMonitor/`.
4. Abra `http://localhost:3000` no navegador. Confirme que a aba "URLs
   monitoradas" carrega e que "Rodar agora" executa uma varredura sem
   erro (confirma que o `cycletls.exe` externo está funcionando).
5. Vá em "Configurações", preencha o token/chat ID do Telegram, salve, e
   clique em "Reiniciar agora" — confirme que o programa reinicia sozinho
   e a UI volta a responder em alguns segundos.
6. Clique em "Ativar início automático". Confirme que um arquivo
   `olx-monitor-autostart.vbs` aparece em
   `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup` (digite
   `shell:startup` na barra de endereços do Explorer para chegar lá).
7. Feche o `OlxMonitor.exe` (task manager, se preciso) e reinicie o
   Windows (ou faça logoff/login). Confirme que **nenhuma janela** abre,
   mas que `http://localhost:3000` volta a responder depois de alguns
   segundos — isso confirma que o `.vbs` está de fato iniciando o
   programa de forma oculta.
8. Clique em "Desativar início automático" e confirme que o `.vbs` some
   da pasta Startup.

Se qualquer passo falhar, anote o erro exato (mensagem, arquivo, linha)
antes de tentar corrigir — a causa mais provável é algo relacionado ao
empacotamento do `sqlite3`/`cycletls` (ver comentários em `database.js`,
`CycleTls.js` e `scripts/build-win.js`).
