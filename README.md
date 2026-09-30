# PM Sports IQ (unificado)

Um único projeto Node.js que serve o dashboard **e** a API de importação
do ogol.com.br na mesma porta — sem CORS, sem digitar URL de backend,
sem dois processos separados.

## Instalar e rodar

```bash
npm install
npm start
```

Abra **http://localhost:3001** no navegador. Pronto — dashboard e API
já estão no ar juntos.

(`npm run dev` usa `node --watch` para reiniciar sozinho quando você edita `server.js` ou os arquivos em `src/`.)

## Estrutura

```
pm-sports-iq/
├── server.js          # Express: serve public/ (dashboard) + rotas /api/ogol/*
├── jobQueue.js         # fila de jobs em memória (scrape único + scrape em lote)
├── src/
│   ├── config.js        # URLs base, delays, retries
│   ├── httpClient.js     # requisições "humanizadas" (cookies, UA, backoff)
│   ├── humanDelay.js      # pausas aleatórias
│   ├── extract.js         # extração genérica por texto/labels e tabelas
│   ├── playerInput.js      # parse/sanitização de slug+id (aceita URL colada)
│   ├── scrapePlayer.js      # perfil + competições + jogos de 1 jogador
│   ├── scrapePlayerList.js   # lista de jogadores → scrape de cada um
│   └── parsers/
│       ├── parsePlayerProfile.js
│       ├── parseCompetitions.js
│       ├── parseGames.js
│       └── parsePlayerList.js
├── public/
│   └── index.html       # o dashboard (PM Sports IQ), servido estaticamente
└── output/              # cache dos resultados (.json) e HTML bruto (.raw.html)
```

## Endpoints da API

| Método | Rota                              | Descrição |
|--------|-----------------------------------|-----------|
| GET    | `/api/health`                     | Healthcheck |
| POST   | `/api/ogol/scrape`                | `{ slug, id, maxGamePages?, force? }` — aceita URL completa colada no lugar do slug |
| POST   | `/api/ogol/scrape-list`           | `{ listUrl, maxPlayers?, maxListPages?, maxGamePages? }` |
| POST   | `/api/ogol/refresh-all`           | `{ maxGamePages? }` — re-scrapeia todos os jogadores já na base |
| GET    | `/api/ogol/jobs/:jobId`           | Status/progresso/resultado (poll a cada 1.5-2s) |
| GET    | `/api/ogol/jobs`                  | Todos os jobs desta sessão do servidor |
| GET    | `/api/ogol/players`               | Jogadores em cache |
| GET    | `/api/ogol/players/:slug/:id`     | Resultado cacheado de um jogador |
| GET    | `/api/ogol/lists`                 | Listas (bulk) já processadas |
| GET    | `/api/ogol/lists/:file`           | Resultado de uma listagem processada |
| GET    | `/api/ogol/database`              | Base achatada (foto, posição, pé, altura, idade, jogos/gols/assist. da temporada atual, última transferência) de todos os jogadores em cache — usada pelo backoffice |
| GET    | `/api/ogol/debug/raw`             | Lista os `.raw.html` salvos (últimas tentativas de scrape) |
| GET    | `/api/ogol/debug/raw/:name`       | Baixa um `.raw.html` específico direto pelo navegador — útil pra diagnosticar em produção sem CLI |

## Uso no dashboard

Aba **⚽ Ogol DB** — um backoffice dedicado, separado do fluxo Wyscout:

1. **Importar**: cole uma URL de listagem do ogol (ex:
   `https://www.ogol.com.br/jogadores/brasil/ativo`) e defina quantos
   jogadores/páginas/temporadas buscar. O servidor coleta perfil completo
   de cada jogador da lista (mesmo scraping "humanizado" de sempre) e
   guarda tudo em `output/*.json`.
2. **Filtrar**: a tabela abaixo lista todos os jogadores já importados
   (de qualquer sessão de import anterior — os dados acumulam). Filtros
   disponíveis: posição, pé preferencial, faixa de altura, faixa de
   idade, mínimo de jogos na temporada atual, busca por nome/clube. Os
   filtros rodam no navegador, sobre os dados já baixados — instantâneo,
   sem re-buscar o ogol.
3. **Detalhe**: clicar numa linha abre um card com foto do jogador, pills
   de posição/pé/altura/situação, bio complementar, temporadas, edições
   (torneios), **transferências** (histórico de valores de mercado por
   temporada) e últimos jogos.
4. **🔄 Atualizar Tudo**: re-busca (do zero) todos os jogadores já
   importados, um por um com pausa humana entre eles. Útil pra manter a
   base em dia sem precisar re-importar listagem por listagem. Roda numa
   fila só (clicar de novo enquanto já está rodando não duplica o
   trabalho, só retorna o mesmo progresso).

Os dados voltam a ficar 100% dentro dessa aba — não há mais nenhuma
integração com o card de jogador do Wyscout (aba Player Scouting).

## 🚀 Deploy em produção (Railway)

Este projeto está pronto pra rodar fora do seu computador, num servidor
sempre ligado. Recomendo **Railway** — ele roda `server.js` como um
processo persistente de verdade (diferente de Netlify/Vercel, que são
feitos para sites estáticos e funções rápidas, e não aguentam um scraping
de vários minutos nem mantêm a base de jogadores entre deploys).

### Passo a passo

1. **Suba este projeto pro GitHub** (se ainda não estiver lá):
   ```bash
   cd pm-sports-iq
   git init
   git add .
   git commit -m "PM Sports IQ"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/pm-sports-iq.git
   git push -u origin main
   ```

2. **Crie a conta/projeto no Railway**: [railway.app](https://railway.app) →
   "New Project" → "Deploy from GitHub repo" → selecione o repositório.
   Railway detecta o `package.json`/`railway.json` sozinho e já sabe rodar
   `node server.js`.

3. **Adicione um Volume (crítico — sem isso você perde a base a cada deploy)**:
   - No projeto, vá em **Settings → Volumes → New Volume**.
   - Monte em `/data` (ou qualquer path).
   - Em **Variables**, adicione:
     ```
     OGOL_DATA_DIR=/data
     ```
     Isso faz o servidor salvar/ler os jogadores coletados nesse volume,
     que sobrevive a redeploys e reinícios.

4. **Deploy automático**: Railway já builda e sobe sozinho a cada `git push`
   pra branch principal — isso já *é* o "produção automática" que você
   pediu. Não precisa rodar `npm start` na sua máquina nunca mais.

5. Railway te dá uma URL pública tipo `https://pm-sports-iq-production.up.railway.app`
   — é isso que você abre no navegador (celular, outro computador, onde
   quiser) em vez de `localhost:3001`.

### Alternativas equivalentes

- **Render.com**: mesmo conceito (Web Service + Persistent Disk), passos
  quase idênticos.
- **Docker em qualquer VPS** (DigitalOcean, Hetzner, etc.): use o
  `Dockerfile` incluído:
  ```bash
  docker build -t pm-sports-iq .
  docker run -d -p 3001:3001 -v /caminho/no/host:/app/output --name pm-sports-iq pm-sports-iq
  ```

### ⚠️ Por que Netlify/Vercel não servem aqui
Ambos rodam código como funções serverless de vida curta (timeout de
segundos a poucos minutos) e sem sistema de arquivos persistente entre
chamadas. Este app precisa de um processo **sempre ligado** (para a fila
de jobs em memória) e de um **disco persistente** (para a base de
jogadores) — por isso a recomendação de Railway/Render/VPS em vez deles.



Como isso agora é um projeto de arquivos normais (não mais um HTML único
gigante para baixar toda vez), o caminho mais direto para eu (ou você)
continuar editando é usando o **Claude Code** apontado para esta pasta —
ele lê e escreve os arquivos diretamente no seu disco, sem gerar zip a
cada mudança.

## ⚠️ Sobre a extração de dados

A extração foi corrigida e **validada contra HTML real** do ogol.com.br
(perfil, competições e jogos de um jogador real). Estrutura confirmada:

- **Dados Pessoais / Histórico / Edições**: o ogol usa blocos `.card-data`
  com `.card-data__title` (título), `.card-data__row` +
  `.card-data__label` / `.card-data__value` (pares label→valor), e dentro
  do card "Histórico", subseções `.section` + `table.career` (uma para
  temporada-a-temporada por clube, outra para "EDIÇÕES" = torneios).
- **Jogos**: a tabela real (`table.zz-table`) tem cabeçalhos quase todos
  vazios (só ícones) — as 16 colunas são mapeadas por **posição** em
  `src/parsers/parseGames.js` (`COLUMN_MAP`). Se o ogol reordenar essas
  colunas um dia, isso quebra silenciosamente — confira os `.raw.html`
  salvos em `output/` para reajustar.
- **Temporadas, não páginas**: `/jogos` **não** pagina por `?page=N` — a
  URL sem parâmetro mostra só a temporada atual. Temporadas anteriores são
  buscadas via `?epoca_id=N`, usando as opções do `<select id="epoca_id">`
  da própria página. O campo "Máx temporadas" no dashboard controla quantas
  temporadas (atual + anteriores) buscar por jogador.
- **Escudo do clube atual**: confirmado em HTML real —
  `<a class="zz-enthdr-club" href="/equipe/..."><img src="..."></a>` no
  cabeçalho da página. **Só existe o escudo do clube ATUAL** — os clubes
  de temporadas passadas, na tabela de Histórico, não têm imagem própria
  nessa página (buscar isso exigiria visitar a página de cada clube
  separadamente, o que não é feito hoje). Aparece na tabela do backoffice
  ao lado do nome do clube, e no card de detalhe junto ao campo "Clube atual".
- **Foto do jogador**: confirmado em HTML real — `<div class="profile_picture"><img src="..."></div>`
  na página de perfil, URL absoluta já pronta (CDN do próprio ogol,
  `cdn-img.staticzz.com`). Aparece como miniatura na tabela e em tamanho
  maior no card de detalhe.
- **Transferências**: card com título "Transferências" na página de
  perfil, tabela direta (sem subseção `.section`) com Temporada/Equipe/
  Valor — inclui valor de mercado histórico de cada movimentação.
- **Competições — Detalhado**: colunas reais são P, T, J, V, E, D, GM
  (gols), A (assistências), AA (cartões amarelos) — **não existe
  minutagem nessa tabela** (minutos só aparece jogo a jogo, em `/jogos`).
- **Jogos com temporada**: cada partida agora carrega o campo `temporada`
  (ex: "2026/27"), permitindo filtrar jogo-a-jogo por temporada no
  backoffice.
- **Nota colorida**: a nota de cada jogo (0-10) é colorida verde
  (≥7) / amarelo (≥6) / vermelho (<6) no backoffice.
- **Retry automático em perfil vazio**: se a página de perfil voltar sem
  nenhum campo de "Dados Pessoais" (sinal de bloqueio temporário ou
  resposta diferente do esperado), o scraper espera uma pausa longa e
  tenta buscar de novo automaticamente antes de desistir. Se mesmo assim
  vier vazio, o resto do scrape continua (jogos/competições geralmente
  não são afetados) e fica salvo `perfil_retry.raw.html` em `output/`
  para diagnóstico — acessível via `/api/ogol/debug/raw/perfil_retry.raw.html`
  direto do navegador, sem precisar de acesso a terminal em produção.
- **Listagem de jogadores** (`/jogadores/{pais}/{status}`): também validada
  contra HTML real. Cada jogador é um `div.zz-search-item.player` com
  `data-id` (o próprio ID!), nome em `a.title`, clube no último `.local`
  com link de time, posição em `.stamp.position`, idade em
  `.stamp[title="Idade"]`. Paginação real por `?page=N` (diferente de
  `/jogos`, que pagina por temporada).


