# Organização Revolucionários App

Central Diplomática responsiva e instalável, pronta para Netlify e Neon PostgreSQL.

## Recursos

- **FACs da Organização:** cadastro ilimitado de FACs, status, logo, observações e datas.
- **Responsáveis:** relação 1:N para quantos responsáveis 00, 01 e 02 forem necessários, com status e observação.
- **WhatsApp:** números são validados e normalizados no backend; a interface oferece link seguro `wa.me`.
- **Blacklist:** nove registros oficiais são criados pelo seed idempotente e continuam totalmente editáveis.
- **Segurança:** toda mutação envia a credencial junto da operação atômica; a validação ocorre somente na Netlify Function, com hash `scrypt`, rate limit e auditoria. Consultas continuam públicas.
- **Identidade/PWA:** `logo.png` gera favicons 16/32, Apple Touch Icon, ícones 192/512 e maskable. Open Graph e Twitter Cards também usam a marca oficial.

## Configuração

1. Use Node.js 20 ou superior e execute `npm install`.
2. Configure `DATABASE_URL` com a conexão do Neon.
3. Crie você mesmo uma credencial inicial de exatamente seis dígitos (não existe senha padrão no código) e configure-a no Netlify como `ADMIN_ACTION_CREDENTIAL`. **Nunca coloque o valor no Git, README, Neon ou frontend.** No primeiro uso autorizado, o backend grava somente um hash `scrypt` no banco; a partir daí, esse hash passa a ser a fonte de autenticação.
4. Aplique o banco de uma destas formas: execute `npm run migrate`; ou copie todo o arquivo `database/neon-complete-setup.sql` para o **Neon SQL Editor** e clique em **Run**. Não execute as duas opções na primeira instalação. O SQL completo é incremental, preserva dados e registra as migrations em `schema_migrations`.
5. Execute `npm run build` ou faça deploy pelo `netlify.toml`.

### Credencial administrativa


Na primeira ação administrativa, a Netlify Function compara a credencial enviada com `ADMIN_ACTION_CREDENTIAL`. Se estiver correta, gera um salt aleatório, calcula o hash com `scrypt` e salva somente `scrypt:<salt>:<hash>` em `app_security_settings`; a credencial em texto puro não é salva no Neon. Depois disso, a autenticação usa o hash do banco, com comparação resistente a timing attack. Após cinco falhas do mesmo IP em 15 minutos, novas tentativas ficam temporariamente bloqueadas.

Para trocar a credencial, use **Admin → Alterar credencial**. A operação protegida `credential/change` valida a credencial atual, confere a nova e sua confirmação, e grava somente o novo hash. Depois da inicialização, alterar apenas `ADMIN_ACTION_CREDENTIAL` no Netlify **não** troca a credencial já registrada; use o fluxo da aplicação. Se perder a credencial, será necessário remover deliberadamente a linha `action_credential_hash` do banco e então cadastrar uma nova variável de bootstrap no Netlify.

## Migration e seed

Para instalação manual no Neon, use o script consolidado `database/neon-complete-setup.sql`. Ele contém integralmente as migrations 001, 002 e 003, o seed oficial da Blacklist e o registro idempotente em `schema_migrations`. Não é necessário criar a credencial no SQL.

`migrations/001_organization_factions.sql` cria `organization_factions`, a relação ilimitada `organization_faction_members`, relações externas, configurações seguras, tentativas e audit logs. O seed da Blacklist usa chave única e `ON CONFLICT DO NOTHING`, portanto pode rodar novamente sem duplicar registros.

## Comandos

```bash
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm run migrate
```

A aplicação local fica em `http://localhost:4173`. Para dados reais, use Netlify Dev ou um deploy, pois `/api/*` é atendido pelas Netlify Functions.

## Galeria, OCR local e inclusão manual

Abra `/#ocr`, escolha a FAC ativa e **Aliados** ou **Inimigos**. **Adicionar prints** abre o seletor nativo de fotos/arquivos: o input aceita PNG, JPG/JPEG e WEBP, é múltiplo e não usa `capture`. O sistema operacional pode oferecer uma opção de câmera; o app não a exige. A área é um label clicável, funciona com teclado e mantém drag-and-drop no computador. São permitidos até cinco arquivos, 12 MB por arquivo e 24 megapixels por imagem. Há preview, nome local, remoção e nova seleção do mesmo arquivo. Formato, tamanho, quantidade, imagem corrompida, preview e OCR têm erros distintos.

O Tesseract.js 6, seu worker, WASM e idioma português são servidos pelo próprio app em `/vendor/`, preparados no build. O OCR roda no navegador: redução de resolução, contraste, segmentação e reconhecimento. As regiões são convertidas para PNG **somente na memória**. O processamento de pixels cede tempo à interface. Não há serviço externo de OCR nem dependência de CDN para o motor. A primeira leitura precisa baixar os assets do próprio site.

**Nenhuma imagem, binário, nome de arquivo, hash, metadado de imagem ou texto bruto completo é enviado à API ou gravado pelo novo fluxo.** Antes de confirmar, a revisão existe apenas na memória da página. A confirmação transmite os nomes editados, o texto original de cada nome, confiança, vínculo canônico e os identificadores da lista. O banco mantém os nomes e dados relacionais/auditoria necessários. As tabelas antigas `submission_images` e `ocr_results` são preservadas por compatibilidade; não recebem registros novos. Não apagamos dados legados. Os previews são liberados após sucesso. As screenshots de testes usam uma imagem sintética, nunca prints do usuário.

O reconhecimento usa a saída em blocos do Tesseract 6; o código anterior procurava apenas `data.lines`, podendo produzir uma revisão vazia. A regressão foi reproduzida no código original: zero nomes para um bloco com um nome; a extração corrigida reconhece esse nome. O erro relatado “source image could not…” não foi reproduzido com o arquivo do usuário; empacotamento local, limite de resolução, fallback de decodificação e regiões PNG tratam causas possíveis, sem comprovar a causa específica do arquivo original.

### Revisão e correção

Cada linha mostra nome original, nome editável, confiança, origem local, possível vínculo canônico/alias, tags de revisão e confirmação. **EDITAR** foca o campo; **REMOVER** exclui a linha da revisão; **Adicionar manualmente** inclui outra. Nomes de baixa confiança permanecem destacados. No fluxo OCR, cada linha exige confirmação; editar invalida a confirmação dessa linha. Não há confirmação automática de texto bruto. A deduplicação ocorre conservadoramente por entidade mestre no backend e preserva os nomes de origem na proveniência textual.

Para cadastrar sem print, escolha a FAC/tipo e clique **CRIAR LISTA MANUAL**. Para corrigir uma lista existente, abra `/#fac/ID`, use **EDITAR** ao lado de cada aliado/inimigo ou **EDITAR LISTA**. Os alertas também levam à edição da lista da FAC envolvida. Adicione, corrija ou remova nomes e confirme. A lista completa revisada cria um novo snapshot; nunca altera snapshots antigos. No fluxo manual, **SALVAR LISTA** confirma os nomes digitados de uma vez, salva o snapshot e abre os detalhes da FAC; não é necessário marcar confirmação por linha. Em caso de falha no salvamento, os nomes permanecem para nova tentativa. A revisão por linha continua obrigatória no OCR. Uma lista vazia exige confirmação explícita e remove apenas as relações atuais daquele tipo. A revisão se mantém ao navegar por hash; recarregar a página descarta a revisão não salva. Trocar a FAC/tipo durante uma revisão exige voltar à seleção original ou iniciar outra revisão.

### Snapshots e cálculos

- O snapshot atual é o **CONFIRMED** mais recente para `source_faction_id + relation_type`, com desempate determinístico. `ALLY` e `ENEMY` são independentes; histórico e status de revisão não entram na situação atual.
- **Aliada de**: FACs oficiais ativas que possuem a entidade mestre no snapshot atual `ALLY`.
- **Tem guerra com**: FACs oficiais ativas que possuem a entidade no snapshot atual `ENEMY`. As frases são montadas a partir dos IDs, nunca persistidas.
- **Coincidência de aliados**: FACs ativas declarantes / FACs ativas esperadas. Se o alvo pertence à Organização, sua própria FAC fica fora do denominador e do numerador. Uma candidata nunca é adicionada automaticamente.
- **Divergência**: a mesma entidade mestre tem pelo menos um declarante `ALLY` e um `ENEMY` nos snapshots atuais. Os cards mostram nome, FACs, tipo, data, snapshot, nível de alerta, detalhes e edição. Dois aliados, dois inimigos ou snapshots antigos não geram divergência.
- **Conflito crítico**: item ativo da Blacklist aparece em `ALLY` atual. A relação não é apagada; a correção da lista recalcula o alerta.
- **Cobertura da Blacklist**: FACs ativas com `ENEMY` atual para o alvo / total de FACs ativas. Lista nominal de FACs com guerra e faltantes. FAC inativa não é exigida. Desativar/remover da Blacklist preserva as relações normais de inimigo.
- **Aliases**: nomes normalizados e aliases existentes são resolvidos para `gang_id` antes da inserção; aliases não criam uma entidade nova. Correspondências imprecisas nunca são aceitas automaticamente.
- **Promoções administrativas**: adicionar à Organização/Blacklist reutiliza `gang_id`, valida a credencial no backend e grava auditoria. A leitura OCR e a confirmação de listas continuam públicas, com limite de submissões no backend.

### Páginas e rotas

`/#inicio`, `/#ocr`, `/#inimigos`, `/#aliados`, `/#divergencias`, `/#blacklist`, `/#facs`, `/#historico`, `/#admin`, `/#fac/ID`, `/#gangue/ID` e `/#historico/SNAPSHOT_ID`.

As páginas ocultam seções fora da rota sem recriar o OCR; voltar, avançar e refresh funcionam com hash routes. O fallback de `netlify.toml` foi preservado. O menu mostra a página ativa, fecha após navegação e move o foco para o título. O footer e a marca oficial foram preservados. Há filtros de inimigos/aliados e cobertura da Blacklist; histórico e detalhes são expansíveis. Alertas prioritários e indicadores são calculados com dados da API, sem atividades fictícias.

### SQL para executar manualmente no Neon

- Para instalação nova ou atualização segura de uma instalação existente: abra **`database/neon-complete-setup.sql`**, copie o conteúdo inteiro no SQL Editor do Neon e execute. O script é transacional e idempotente; reutiliza as tabelas, preserva os dados e registra as migrations.
- Se 001 e 002 já estiverem instaladas, **`database/neon-upgrade-003.sql`** contém somente a atualização 003, também com transação e registro em `schema_migrations`.
- A migration nova **`003_review_provenance.sql`** adiciona nomes revisados, proveniência textual, origem OCR/MANUAL, limite de submissões e repara vínculos mestres ausentes dos cadastros antigos. Não cria tabela por FAC nem novas tabelas de imagens. Não apaga imagens/metadados legados.
- Alternativa automatizada: `npm run migrate` com `DATABASE_URL` configurada. Não executamos migrations no Neon real neste ambiente, pois a conexão não foi fornecida.

### Desenvolvimento e validação

`npm run dev` gera o build e serve `dist` na porta 4173, incluindo os assets locais do OCR. O servidor estático não emula as Functions; dados reais exigem Netlify Dev ou deploy com as variáveis configuradas. As variáveis são lidas no backend, nunca embutidas no frontend.

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run test:browser
npm run build
git diff --check
```

`lint` e `typecheck` são os scripts existentes de verificação sintática com `node --check`; o projeto JavaScript não tem TypeScript nem verificação estática de tipos completa. `npm test` executa testes unitários e integração PostgreSQL via PGlite com banco descartável, migrations reais, transações, rollback, aliases, preservação entre tipos, snapshots atuais e alertas. `npm run test:browser` usa Playwright, Chromium, OCR real com WASM/português do próprio build, banco descartável e axe para verificações básicas WCAG. Não acessa o Neon. No Linux há Chromium empacotado; em outros sistemas instale `npx playwright install chromium`. É possível escolher outro executável com `REVO_CHROMIUM_PATH`.

As larguras automatizadas são 320, 360, 375, 390, 412 e 430 px. Os testes cobrem seletor nativo por teclado, `setInputFiles`, seleção múltipla, seleção repetida, limites, JPEG/WEBP reais, arquivo corrompido, drag-and-drop, navegação, menu, refresh, manutenção da revisão, confirmação sem imagem no payload, correção manual, PWA e ausência de overflow. Capturas: `artifacts/screenshots/ocr-mobile.png`, `ocr-desktop.png`, `divergencias.png`, `blacklist.png`, `fac.png`.

Limitações: não houve dispositivo Android/iPhone físico nem instalação real de PWA nesses aparelhos. A automação Chromium não comprova a apresentação do seletor nativo em Safari/Android. Não houve conexão/auditoria do Neon real, deploy ou teste do domínio publicado no Netlify. O OCR foi exercitado com texto sintético legível; prints de jogo com fontes pequenas, colunas, ícones, compressão ou baixo contraste podem gerar nomes incorretos. A revisão humana é obrigatória e o cadastro manual continua disponível. Consulte `docs/auditoria.md` para o relatório e os limites da validação.
