# Repetições, recorte, OCR e persistência

## Correções

- Avisos por nome e bloco para repetição no envio, nome já existente na lista atual e cadastro ativo na Blacklist. As linhas envolvidas são destacadas e VER BLOCO foca o campo. Repetições válidas são consolidadas em uma relação; a lista inteira não é recusada.
- A resolução por nome canônico e depois alias é compartilhada por frontend/backend, evitando decisões diferentes conforme a ordem de uma consulta. Correspondência desatualizada devolve 409 com todas as linhas envolvidas, nome e cadastro atual; os campos permanecem para revisão e o catálogo é atualizado.
- Uma FAC na Blacklist não precisa de outro cadastro. Sua presença em ENEMY registra a guerra declarada pela FAC de origem, necessária à cobertura, sem duplicar a entidade. Excluir esses registros de guerra prejudicaria a cobertura e não foi feito.
- Adicionar manualmente carrega a lista atual e acrescenta uma linha. Antes, iniciava um snapshot COMPLETE vazio, de modo que salvar somente o novo nome podia substituir os demais. Essa é uma causa reproduzível de substituição de lista, mas não comprova o que ocorreu no Neon real.
- Uma leitura OCR completa pede confirmação com os nomes que ficarão de fora da lista atual. Histórico tem RESTAURAR ESTA LISTA, que abre uma revisão e somente cria outro snapshot quando o usuário salva. Não exclui os anteriores.
- O recorte usa controles de esquerda/direita/topo/base, operáveis por teclado e touch. O resultado é um Blob na memória, não modifica o arquivo original e não é enviado ao backend.
- O OCR detecta cartões pelos separadores horizontais, restringe a região do nome, aplica contraste/binarização e agrupa linhas do mesmo cartão. Uma segunda leitura é usada em casos de confiança baixa; resultados diferentes ficam sinalizados. Uma coluna sem cartões permanece um bloco, sem cortes arbitrários por altura. Não se juntam nomes de cartões diferentes.
- API com no-store e exclusão do cache da PWA permanecem. Quando a consulta ao servidor falha, cobertura não é exibida como zero, evitando confundir indisponibilidade com exclusão.

## Persistência e deploy

A confirmação chama `/api/diplomacy-submit`, que grava snapshot, entradas e audit log em transação PostgreSQL. O retorno 201 só ocorre depois do commit. Nenhum arquivo de imagem, hash, nome de arquivo ou texto OCR completo é gravado. Revisões não confirmadas existem somente na memória da página e se perdem no refresh; listas confirmadas ficam no banco.

`netlify.toml` usa `npm run build:netlify`. Esse comando aplica as migrations versionadas antes de construir a aplicação. Requer DATABASE_URL no Netlify nos escopos Builds e Functions, sem expor a variável ao frontend. Não exige SQL colado no editor do Neon. Se faltar a variável ou uma migration falhar, o deploy falha em vez de publicar um frontend incompatível.

O executor mantém cada arquivo SQL inteiro, usa trava transacional e verifica `schema_migrations` dentro da trava. O executor anterior dividia por ponto e vírgula antes de remover comentários, quebrando comentários que contivessem esse caractere. Só versões pendentes são aplicadas; não há reset, truncate ou nova migration neste PR. Os scripts SQL opcionais existentes continuam disponíveis para manutenção.

## Testes e limites

- Banco PostgreSQL isolado em disco: aplicar migrations, gravar ALLY/ENEMY, fechar o banco, reabrir e simular novos deploys reaplicando as migrations. IDs de snapshots, entradas, status editados e relações permaneceram iguais. Isso demonstra persistência em PostgreSQL, sem depender do cache da página.
- Playwright: salvar nomes repetidos/Blacklist, recorte local que exclui texto lateral, erro 409 com bloco identificado, restauração do histórico, inclusão manual preservando os nomes anteriores, revisão OCR e refresh. Mantidos os testes de menu, seis larguras, acessibilidade, PWA offline e privacidade do payload.
- Quatro fotos fornecidas: cinco nomes inteiros por foto, total 20 cartões, sem fotos copiadas ao Git ou enviadas ao backend. A medição final teve 18/20 nomes literais exatos após normalizar caixa/acentos; houve confusões em TREM DO ODIO 00 e RLK NOIS MERMO. Os campos divergentes são sinalizados e exigem revisão. O teste de segmentação admite pequenos erros de caracteres, mas não fragmentação de nomes; a contagem literal é registrada separadamente, sem declarar OCR perfeito.
- Não houve teste físico Android/iPhone/PWA. Os testes de navegador usam Chromium e o motor Tesseract/WASM/português real do build.
- Tentativa de GET ao Netlify publicado: o proxy deste ambiente recusou a conexão HTTPS com 403, antes de receber resposta do site. DATABASE_URL e credencial administrativa também não estão presentes nesta máquina. Não houve leitura/escrita no Neon de produção, nem é possível afirmar que um merge apagou dados nesse banco. O domínio foi confirmado pelos checks do GitHub como orgrevolu.netlify.app (o endereço do print havia sido transcrito incorretamente). Os destinos orgrevolu.netlify.app, deploy-preview-10--orgrevolu.netlify.app e api.github.com foram acrescentados ao rascunho de rede para revisão/aplicação, sem curingas. Nenhuma imagem ou relação fictícia foi inserida em produção.

Para repetir os exemplos: `REVO_OCR_EXAMPLES_DIR=/diretorio/das/quatro/fotos npm run test:browser`. O caminho deve conter os arquivos 1-91643.jpg, 2-91640.jpg, 3-91634.jpg e 4-91631.jpg; eles não fazem parte do repositório.

## Resultado final

Passaram `npm run lint`, `npm run typecheck`, `npm test` (31/31), `npm run test:browser` com as quatro fotos (12/12), build local e `git diff --check`. O empacotamento da Function com `@netlify/zip-it-and-ship-it` também passou e gerou api.zip. Isso não significa deploy concluído nem migration executada no Neon real; o build de produção precisa da DATABASE_URL configurada no Netlify. As capturas de recorte e repetição usam imagens sintéticas e estão em artifacts/screenshots. Nenhuma das quatro fotos do usuário foi adicionada ao repositório.

O PR #10 foi criado em https://github.com/GodoyTECH/revo-app/pull/10. O check netlify/orgrevolu/deploy-preview confirmou SUCCESS para o commit ae5b745, com preview https://deploy-preview-10--orgrevolu.netlify.app. As chamadas HTTPS aos endpoints de produção e preview continuaram bloqueadas pelo proxy da sessão; não houve escrita em produção. O status de deploy bem-sucedido não comprova a leitura/gravação das listas reais.
