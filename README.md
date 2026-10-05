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

Não foi colocada nenhuma credencial fixa ou padrão no projeto. No Netlify, acesse **Site configuration → Environment variables**, crie `ADMIN_ACTION_CREDENTIAL` e defina um valor escolhido por você com exatamente seis números (por exemplo, escolha um valor próprio; não reutilize exemplos da documentação). Faça um novo deploy após salvar a variável.

Na primeira ação administrativa, a Netlify Function compara a credencial enviada com `ADMIN_ACTION_CREDENTIAL`. Se estiver correta, gera um salt aleatório, calcula o hash com `scrypt` e salva somente `scrypt:<salt>:<hash>` em `app_security_settings`; a credencial em texto puro não é salva no Neon. Depois disso, a autenticação usa o hash do banco, com comparação resistente a timing attack. Após cinco falhas do mesmo IP em 15 minutos, novas tentativas ficam temporariamente bloqueadas.

Para trocar a credencial, use **Admin → Alterar credencial**. A operação protegida `credential/change` valida a credencial atual, confere a nova e sua confirmação, e grava somente o novo hash. Depois da inicialização, alterar apenas `ADMIN_ACTION_CREDENTIAL` no Netlify **não** troca a credencial já registrada; use o fluxo da aplicação. Se perder a credencial, será necessário remover deliberadamente a linha `action_credential_hash` do banco e então cadastrar uma nova variável de bootstrap no Netlify.

## Migration e seed

Para instalação manual no Neon, use o script consolidado `database/neon-complete-setup.sql`. Ele contém integralmente as migrations 001 e 002, o seed oficial da Blacklist e o registro idempotente em `schema_migrations`. Não é necessário criar a credencial no SQL.

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

## Diplomacia, OCR e snapshots

O fluxo principal fica em **OCR** na navegação: selecione primeiro a FAC oficial de origem, escolha **Inimigos** ou **Aliados**, envie até cinco PNG/JPEG/WEBP e revise cada nome antes de confirmar. O OCR é executado no navegador pelo `Tesseract.js` (worker WebAssembly, idioma português); as imagens passam por resize, grayscale/contraste e imagens longas são segmentadas. Nenhuma leitura bruta é confirmada automaticamente. O upload persiste apenas metadados, SHA-256 e texto OCR — não o arquivo binário.

A migration incremental `002_diplomacy_ocr.sql` reutiliza `organization_factions`, `external_relations` e `audit_logs`, adiciona a entidade mestre `gangs`, aliases, snapshots separados por `ALLY`/`ENEMY`, entradas, imagens e resultados OCR. Ela vincula os registros antigos sem removê-los. Um snapshot `COMPLETE` novo se torna a situação atual somente do mesmo tipo e origem; os anteriores continuam no histórico.

- **Inimigos** são calculados pelas entradas do snapshot `ENEMY` confirmado mais recente de cada FAC. “Tem guerra com” nunca é texto persistido.
- **Blacklist** continua independente e administrável. Sua promoção exige a credencial de seis dígitos; sair da Blacklist não apaga snapshots de inimigos.
- **Aliados** são calculados pelas entradas `ALLY`. A coincidência divide as FACs de origem pelo total de FACs oficiais ativas; quando o alvo já é uma FAC oficial, ela própria é retirada do denominador.
- **Adicionar à Organização** reutiliza o mesmo `gang_id`, exige credencial no backend e gera audit log; nunca ocorre silenciosamente.
- O backend valida IDs, tipos, limites (5 imagens/250 nomes), hashes e MIME. Hash repetido é recusado como possível duplicidade.

A migration deve ser aplicada com `npm run migrate` usando `DATABASE_URL`. O OCR precisa de acesso ao CDN do Tesseract na primeira execução para carregar o worker e os dados do idioma; depois o navegador pode reutilizar o cache HTTP.
