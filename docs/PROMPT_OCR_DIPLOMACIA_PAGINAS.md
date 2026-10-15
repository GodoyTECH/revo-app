# Prompt de implementação — OCR, inteligência diplomática e páginas responsivas

Você trabalhará em um projeto **já existente** da Organização Revolucionários. Faça auditoria e refatoração incremental; não recrie o projeto, não apague dados e não repita funcionalidades já entregues.

## Objetivo

Validar e concluir o fluxo real:

**galeria do celular → seleção do print → OCR → revisão humana → confirmação → persistência → consolidação por FAC → detecção de divergências diplomáticas**, reorganizando a interface em páginas menores e responsivas para evitar rolagem excessiva.

## Regras obrigatórias antes de alterar código

1. Leia `AGENTS.md` aplicáveis e analise todo o repositório, o schema, migrations, Netlify Functions, frontend, testes, PWA e README.
2. Identifique o que já funciona, o que está parcial, o que é apenas visual e os defeitos reproduzíveis.
3. Preserve React/JavaScript ou a stack encontrada, Netlify, Neon PostgreSQL, PWA, autenticação, dados, identidade visual, logo e footer existentes.
4. Reutilize tabelas e componentes. Só crie migration incremental se o modelo atual realmente não suportar a regra.
5. Antes de editar, registre um plano curto. Ao final, informe exatamente os arquivos alterados e por quê.

## 1. Upload pela galeria do celular

O botão **Adicionar prints** deve abrir o seletor de arquivos/fotos do aparelho, permitindo escolher prints já salvos. Não pode forçar diretamente a câmera.

- Use `input type="file"` com `accept="image/png,image/jpeg,image/webp"` (ou equivalente compatível).
- Não use `capture="environment"`, `capture="user"` ou lógica que invoque obrigatoriamente a câmera.
- Preserve seleção múltipla, limite de cinco imagens, preview, remoção individual e validação de MIME/tamanho.
- O botão e toda a área de upload devem acionar o mesmo input; teclado e leitor de tela também devem funcionar.
- Permita selecionar novamente o mesmo arquivo depois de removê-lo, limpando o valor do input quando necessário.
- Em desktop, preserve clique e drag-and-drop.
- Mensagens devem distinguir arquivo inválido, excesso de arquivos, tamanho excedido e falha de leitura.

### Teste obrigatório da galeria

Validar em larguras 320, 360, 375, 390, 412 e 430 px e, quando o ambiente permitir, em Android Chrome e iOS Safari/PWA instalado:

1. tocar em **Adicionar prints**;
2. confirmar que aparece galeria/seletor de fotos, sem abertura forçada da câmera;
3. selecionar um print PNG/JPEG/WEBP existente;
4. visualizar preview e nome;
5. remover e selecionar novamente;
6. selecionar múltiplas imagens;
7. processar sem travar a interface.

Se não houver dispositivo real no ambiente, automatize o `setInputFiles`, registre a limitação e não declare teste físico como executado.

## 2. Fluxo OCR completo

A ordem deve ser clara e obrigatória:

1. escolher/pesquisar a **FAC dona da lista**;
2. selecionar **Aliados** ou **Inimigos**;
3. escolher um ou mais prints da galeria;
4. mostrar previews;
5. processar OCR com progresso por imagem;
6. exibir revisão humana;
7. corrigir, remover, confirmar ou adicionar nomes manualmente;
8. confirmar a lista;
9. salvar snapshot e relações;
10. atualizar imediatamente páginas, indicadores e alertas.

Nunca salve automaticamente o texto bruto. Cada linha reconhecida deve exibir:

- nome original lido;
- nome editável/canônico;
- confiança;
- tag **Revisar** para baixa confiança;
- possível correspondência/alias, quando aplicável;
- ações editar, confirmar e remover.

Após a confirmação, mostre um resumo como:

- `GODDOY R.K — 12 inimigos e 15 aliados`;
- nomes adicionados desde o snapshot anterior;
- nomes removidos desde o snapshot anterior;
- divergências novas ou resolvidas.

## 3. Modelo e consolidação por FAC

Cada snapshot pertence a uma FAC de origem e a um único tipo (`ALLY` ou `ENEMY`). Um novo snapshot completo substitui somente a situação atual daquele tipo e daquela FAC, preservando o histórico.

Exemplo:

- GODDOY R.K: aliados `FAC A`, `FAC B`; inimigos `FAC X`.
- FAMÍLIA RJ: aliados `FAC A`; inimigos `FAC B`, `FAC X`.

A interface consolidada deve calcular:

- `FAC A` é aliada de GODDOY R.K e FAMÍLIA RJ;
- `FAC X` é inimiga de GODDOY R.K e FAMÍLIA RJ;
- `FAC B` é aliada de GODDOY R.K e inimiga de FAMÍLIA RJ;
- `FAC B` possui divergência diplomática.

Não persista frases como “tem guerra com”. Persista relações por IDs e monte essas frases por consulta.

## 4. Divergências e alertas inteligentes

Detecte conflitos usando os snapshots confirmados mais recentes de cada FAC e tipo. Não apague nenhuma relação conflitante.

### Divergência aliado × inimigo

Quando uma gangue for aliada de pelo menos uma FAC e inimiga de pelo menos outra, exiba um card de alerta com:

- nome da gangue conflitante;
- tag **Divergência diplomática**;
- lista `Aliada de: ...`;
- lista `Inimiga de: ...`;
- FAC e tipo de cada relação;
- link para detalhes da gangue;
- data dos snapshots usados.

Exemplo:

`FAC B — aliada de GODDOY R.K; inimiga de FAMÍLIA RJ.`

### Blacklist × aliado

Se uma gangue ativa na Blacklist aparecer como aliada de qualquer FAC, exiba **Conflito crítico** e informe claramente qual FAC declarou a aliança.

### Cobertura da Blacklist

Para cada item ativo da Blacklist, compare todas as FACs oficiais ativas e mostre:

- quem possui guerra;
- quem não possui guerra;
- cobertura `N/total` e percentual;
- tag **Cobertura completa** ou **Pendência**.

### Regras de consistência

- Não conte a própria FAC como aliada dela mesma.
- Não confunda Blacklist com inimigo normal.
- Não marque como divergência duas relações do mesmo tipo.
- Não use snapshots antigos quando já houver um confirmado mais recente para a mesma origem/tipo.
- Deduplicate por entidade mestre/alias normalizado, mas preserve texto original do OCR.

## 5. Tags e revisão

Crie/reutilize tags visuais consistentes:

- **Revisar OCR**;
- **Baixa confiança**;
- **Possível correspondência**;
- **Aliado exclusivo**;
- **Aliado compartilhado**;
- **100% de coincidência**;
- **Candidata à Organização**;
- **Guerra particular**;
- **Guerra compartilhada**;
- **Blacklist**;
- **Pendência da Blacklist**;
- **Divergência diplomática**;
- **Conflito crítico**.

Tags informativas não podem executar alterações administrativas. Promoção para Organização/Blacklist continua exigindo credencial no backend.

## 6. Separar em páginas para reduzir rolagem

Não mantenha todo o produto em uma única página longa. Implemente navegação real compatível com hospedagem Netlify e PWA, sem quebrar links diretos ou refresh.

Páginas mínimas:

- **Início/Dashboard**: indicadores e alertas prioritários;
- **OCR/Nova leitura**: wizard e revisão;
- **Inimigos**: consolidação, filtros e detalhes;
- **Aliados**: consolidação, cobertura e candidatos;
- **Divergências**: aliado × inimigo e Blacklist × aliado;
- **Blacklist**: cobertura obrigatória e administração;
- **FACs**: oficiais, responsáveis e visão diplomática por FAC;
- **Histórico**: snapshots e diferenças;
- **Admin**, se já existir arquitetura apropriada.

Pode usar roteamento já existente ou rotas/hash routes simples, mas deve:

- manter URL navegável e botão voltar;
- funcionar ao atualizar a página no Netlify;
- manter menu desktop e menu mobile;
- destacar página ativa;
- fechar menu após navegar;
- preservar acessibilidade e foco;
- evitar carregar/reprocessar OCR ao navegar;
- não duplicar IDs ou handlers.

## 7. Conteúdo das páginas

### Dashboard

Mostrar, calculados do banco:

- FACs oficiais ativas;
- inimigos únicos;
- guerras compartilhadas;
- itens ativos da Blacklist;
- pendências da Blacklist;
- aliados únicos;
- aliados com 100% de coincidência;
- divergências diplomáticas;
- conflitos críticos.

### Página da FAC

Exemplo `GODDOY R.K`:

- resumo `Blacklist 8/9`, inimigos normais, aliados e conflitos;
- lista de aliados atuais;
- lista de inimigos atuais;
- Blacklist atendida e faltante;
- divergências envolvendo a FAC;
- histórico separado de aliados/inimigos.

### Página da gangue

Mostrar:

- nome canônico e aliases;
- aliada de quais FACs;
- inimiga de quais FACs;
- se está na Blacklist;
- se pertence à Organização;
- cobertura/percentual relevante;
- divergências;
- ações administrativas autorizadas.

## 8. Design e responsividade

Preserve preto, grafite, azul profundo/frio e dourado, logo oficial e footer. Melhore hierarquia, espaçamento e legibilidade sem redesenhar desnecessariamente.

- mobile first;
- sem overflow horizontal;
- alvos de toque de no mínimo 44×44 px;
- cards compactos e expansíveis;
- filtros roláveis ou empilhados no celular;
- estados loading, vazio, erro e sucesso;
- contraste acessível;
- `prefers-reduced-motion`;
- footer em todas as páginas;
- não carregar CSS como módulo JavaScript.

## 9. Backend, segurança e banco

- Valide tudo novamente no backend; OCR é entrada não confiável.
- Preserve limites de quantidade, tamanho, MIME, comprimento e SHA-256.
- Mantenha OCR público se essa for a regra existente; operações administrativas continuam protegidas.
- Use queries parametrizadas e transações atômicas.
- Garanta idempotência e tratamento de concorrência/duplicidade.
- Não exponha credencial, `DATABASE_URL`, texto sensível ou stack trace.
- Não crie tabelas por FAC.
- Se uma migration for indispensável, torne-a incremental, atualize o schema/setup consolidado e explique rollback/compatibilidade.

## 10. Testes obrigatórios

Adicione testes que falhem antes da correção e passem depois:

1. input da galeria sem atributo `capture`;
2. PNG/JPEG/WEBP, múltiplos arquivos, remoção e nova seleção;
3. validações de limites e MIME;
4. snapshot novo de aliados não apaga inimigos;
5. snapshot novo de inimigos não apaga aliados;
6. apenas snapshot confirmado mais recente entra na consolidação;
7. aliado de uma FAC e inimigo de outra gera divergência com nomes corretos;
8. Blacklist aliada gera conflito crítico;
9. cobertura da Blacklist lista FACs faltantes;
10. entidade da própria Organização não exige autoaliança;
11. aliases não duplicam gangues;
12. navegação/refresh de todas as páginas;
13. responsividade nas larguras solicitadas;
14. acessibilidade básica por teclado;
15. build Netlify/PWA.

Execute e corrija todos os erros:

```bash
npm install
npm run lint
npm run typecheck
npm run test
npm run build
```

Execute também `git diff --check`. Quando houver aplicação executável e mudança visual, suba localmente e capture screenshots mobile e desktop das páginas OCR, Divergências e Blacklist.

## 11. README e entrega

Atualize o README com:

- como abrir a galeria e enviar prints;
- formatos/limites;
- revisão humana;
- snapshots atuais e histórico;
- lógica “Aliada de” e “Tem guerra com”;
- divergência aliado × inimigo;
- conflito Blacklist × aliado;
- cobertura da Blacklist;
- páginas/rotas;
- migrations novas, se houver;
- testes executados;
- limitações reais do OCR e como corrigir leituras.

## Critérios de aceite

Só conclua quando for possível:

1. abrir o app no celular;
2. entrar na página OCR sem longa rolagem;
3. escolher a FAC de origem e o tipo;
4. tocar em **Adicionar prints** e abrir galeria/seletor, não câmera forçada;
5. escolher print salvo;
6. ver preview;
7. executar OCR real;
8. revisar/corrigir/adicionar/remover nomes;
9. confirmar;
10. abrir a FAC e ver aliados/inimigos atuais;
11. abrir Divergências e ver, pelo nome, quem considera a gangue aliada e quem a considera inimiga;
12. abrir Blacklist e ver cobertura e FACs pendentes;
13. navegar entre páginas sem perder estado ou quebrar PWA/Netlify;
14. passar lint, typecheck, testes e build.

## Relatório final esperado

Responda objetivamente:

1. qual era a causa do problema da galeria;
2. como foi validado em mobile;
3. como OCR e revisão funcionam;
4. como snapshots são atualizados;
5. como divergências são calculadas;
6. como conflitos de Blacklist são calculados;
7. quais páginas/rotas foram criadas;
8. quais arquivos e migrations mudaram;
9. quais testes foram executados e resultados;
10. se o build Netlify terminou com sucesso;
11. limitações ou testes físicos não executados.
