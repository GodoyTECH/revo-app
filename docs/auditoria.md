# Auditoria e validação

## Escopo e limites

Repositório existente `GodoyTECH/revo-app`, base `9f445ee5fa061c1f480e9662f94aa1ddc0c4a9d3`. Foram inspecionados todos os arquivos versionados de aplicação, estilos, build, servidor, Netlify, migrations, schema consolidado, testes, README, manifest e service worker. Não foram encontrados AGENTS.md aplicáveis. O checkout estava limpo no início. Não houve recriação de projeto, exclusão de dados, execução de migration remota ou alteração de identidade, logo, footer, mecanismo de credencial administrativa ou configuração Netlify. O service worker recebeu uma correção pontual após falhar no teste de refresh offline: clonar a resposta antes de consumir o corpo e aguardar a persistência. O build também passou a versionar todos os módulos JS para evitar OCR antigo sob cache imutável.

A configuração do ambiente e os nomes/presença de variáveis foram conferidos sem imprimir valores: `DATABASE_URL` e `ADMIN_ACTION_CREDENTIAL` ausentes. Logo, o schema e os dados do Neon real não puderam ser auditados. O Git HTTPS existente foi validado por `git ls-remote origin HEAD`, sem pedir token. O banco dos testes é PostgreSQL via PGlite em memória, descartável e sem conexão com produção.

## Achados e respostas aos requisitos

1. **Galeria:** o input original já não tinha `capture`. Não se comprovou câmera obrigatória no código. Os problemas encontrados foram ausência de nome acessível, teclado na área não funcional, input não limpo ao remover/reselecionar e descarte silencioso de arquivos com mensagens genéricas. O input permanece nativo, múltiplo e sem `capture`; o sistema operacional escolhe a apresentação do seletor.
2. **OCR existente:** havia Tesseract real, não simulação. A extração só usava `data.lines`, enquanto a versão 6 fornece linhas via blocos quando esse output é solicitado. Um fixture de blocos produziu zero nomes na base original e um na correção. O worker não era encerrado se o pré-processamento falhasse antes do `try`. Esses caminhos foram corrigidos.
3. **Erro de imagem relatado:** o arquivo real que provocou “source image could not…” não estava disponível. Não afirmamos ter reproduzido esse erro específico. Foram implementados fallback de decodificação, limite de pixels, processamento cooperativo, segmentação inteira e PNG em memória. O motor e seus dados agora são servidos pelo próprio build, sem CDN de OCR.
4. **Privacidade conforme orientação final:** a imagem permanece no navegador. A API recebe somente os nomes revisados, dados relacionais e confiança/original textual do nome; nenhum arquivo, imagem, nome de arquivo, hash ou texto OCR completo. As tabelas legadas de imagens/resultados são preservadas, mas o fluxo novo não grava nelas. A automação verifica o payload e as contagens zero dessas tabelas.
5. **Revisão:** cada nome é editável, removível e deve ser confirmado. Baixa confiança é destacada; nomes originais, correções e vínculo mestre são mantidos. Alteração invalida confirmação. A inclusão manual funciona tanto após OCR quanto sem qualquer print. A navegação não destrói o DOM nem reprocessa a leitura.
6. **Snapshots:** confirmação cria lista completa por FAC/tipo; não modifica a lista do outro tipo nem remove histórico. A edição também cria snapshot. Lista vazia tem confirmação explícita. Atualidade é calculada pelo último confirmado da combinação, com desempate determinístico. Datas PostgreSQL preservam precisão para comparar snapshots próximos.
7. **Mestres/aliases:** a confirmação original ignorava `gang_aliases`; agora resolve nomes e aliases antes de inserir relações, deduplica por ID e mantém proveniência textual. Novos cadastros administrativos de FAC/Blacklist passam a preencher o vínculo mestre. A migration 003 repara vínculos nulos anteriores sem apagar dados.
8. **Aliada de / Tem guerra com:** calculados por entradas dos snapshots atuais `ALLY`/`ENEMY` e FACs oficiais ativas; a resposta mantém a FAC, tipo, data e snapshot utilizados.
9. **Divergência:** entidade com aliados e inimigos atuais; alertas nomeiam todas as FACs envolvidas e ligam às listas editáveis. Somente relações antigas, duas alianças, duas guerras ou aliases não geram divergência.
10. **Blacklist × aliado:** cadastro ativo independente com aliança atual produz alerta crítico; nenhuma relação é removida automaticamente. Corrigir a lista atualiza o alerta. Desativar Blacklist mantém inimigos normais.
11. **Cobertura:** compara guerras atuais com todas as FACs oficiais ativas e lista faltantes. O alvo oficial é excluído da sua própria expectativa de autoaliança no cálculo de coincidência. Promoção à Organização permanece administrativa e nunca automática.
12. **Interface:** hash routes reais para início, OCR, inimigos, aliados, divergências, Blacklist, FACs, histórico, admin e detalhes de FAC/gangue/snapshot. Indicadores reais e alertas prioritários substituem a lista de atividades fictícias. Filtros, detalhes expansíveis, foco, menu mobile e footer foram preservados/aprimorados.
13. **Segurança:** parâmetros SQL e transações mantidos; confirmação e auditoria atômicas, validação de IDs/tipos/modo/nomes/quantidade/confiança/confirmação, limite de tamanho do JSON, limite de submissões por IP com trava transacional. Credencial administrativa continua somente no backend. Nenhum stack trace, conexão ou hash sensível é enviado ao frontend.
14. **SQL entregue:** `database/neon-complete-setup.sql` para instalação/atualização completa e `database/neon-upgrade-003.sql` para uma base que já tenha 001/002. A única migration nova é `003_review_provenance.sql`. Não há tabela por FAC nem nova tabela de imagens. Scripts incrementais não apagam dados.

## Evidências executadas

- `npm install`: passou com cache em diretório gravável, mantendo integridade npm. O primeiro comando falhou por cache padrão sem permissão; foi corrigido sem desabilitar verificação.
- `npm run lint` e `npm run typecheck`: scripts existentes executam verificação sintática; não equivalem a uma análise TypeScript completa.
- `npm test`: suites unitárias e PostgreSQL com migrations idempotentes, seed, separação por tipo, aliases, nomes de FACs nos alertas, conflitos, remoção manual, ausência de persistência de imagens, auditoria e rollback.
- `npm run test:browser`: Chromium com assets reais do próprio build, Tesseract/WASM/português e PostgreSQL descartável. Não há OCR simulado nem mock da confirmação de listas; o test server usa as funções reais de submissão e consulta. As mutações administrativas do test server são recusadas, e a autenticação é testada na suite própria.
- Larguras 320/360/375/390/412/430: navegação, refresh, menu, múltiplos arquivos, remoção/reseleção, overflow, IDs únicos e footer.
- Seletor nativo por teclado, PNG/JPEG/WEBP reais, limites, corrupção, drag-and-drop, revisão obrigatória, edição e inclusão manual, confirmação com payload sem imagem e manutenção dos inimigos após salvar aliados.
- Axe para WCAG A/AA básica em OCR, divergências, Blacklist, FACs e detalhe da FAC. Isso não substitui avaliação humana com leitor de tela.
- Screenshots sintéticas em `artifacts/screenshots/`: OCR mobile/desktop, divergências, Blacklist e FAC.
- Build usa exatamente o comando definido em `netlify.toml`, `npm run build`. Não houve deploy no Netlify nem validação do domínio publicado.

## Não comprovado / próximo passo externo

- Não há teste físico de Android Chrome, Safari/iPhone ou PWA instalado em aparelhos reais.
- Não há auditoria de tabelas/dados do Neon real, aplicação da migration remota, teste de conexão ou persistência nesse Neon: falta `DATABASE_URL` e a liberação do hostname Neon correspondente.
- O bootstrap administrativo em produção exige `ADMIN_ACTION_CREDENTIAL` ou hash já inicializado no banco. Nenhum valor foi pedido em chat ou inventado.
- OCR foi testado com print sintético legível; legibilidade de prints do jogo permanece dependente da qualidade da imagem. Use revisão e edição manual para leituras incorretas.
- O rascunho do ambiente salva instalação e inicialização, mas não publica nem aplica configurações ao runtime por si só. Revisar/salvar e publicar ocorre nas configurações do ambiente.

## Resultado final da rodada

`npm install` e `npm ci --cache /workspace/.cache/revo-npm` passaram com verificação de integridade. `npm run lint`, `npm run typecheck`, `npm test` (**25/25**), `npm run test:browser` (**5/5**), `npm run build` e `git diff --check` passaram. O teste de refresh offline falhou antes da correção do service worker e passou depois. O teste de integração aplica tanto o SQL consolidado quanto o upgrade 003 duas vezes e valida o limite de 20 submissões por IP/15 minutos.

O build da configuração Netlify gerou cinco assets JS/CSS com hash e o motor OCR local em `dist/vendor`; não se trata de um deploy. O servidor de desenvolvimento foi reiniciado para servir esse build. A instalação e as instruções de inicialização foram salvas no rascunho do ambiente para revisão; a publicação e a integração com Neon continuam pendentes.

## Arquivos alterados ou adicionados

- `README.md`
- `artifacts/screenshots/blacklist.png`
- `artifacts/screenshots/divergencias.png`
- `artifacts/screenshots/fac.png`
- `artifacts/screenshots/ocr-desktop.png`
- `artifacts/screenshots/ocr-mobile.png`
- `database/neon-complete-setup.sql`
- `database/neon-upgrade-003.sql`
- `docs/auditoria.md`
- `index.html`
- `migrations/003_review_provenance.sql`
- `netlify/functions/api.mjs`
- `netlify/functions/lib/validation.mjs`
- `package-lock.json`
- `package.json`
- `playwright.config.js`
- `public/sw.js`
- `scripts/build.mjs`
- `scripts/server.mjs`
- `scripts/test-server.mjs`
- `src/diplomacy.js`
- `src/gallery.js`
- `src/main.js`
- `src/ocr-provider.js`
- `src/styles.css`
- `tests/browser/app.spec.js`
- `tests/build.test.js`
- `tests/diplomacy.test.js`
- `tests/integration.test.js`
- `tests/workflow.test.js`
