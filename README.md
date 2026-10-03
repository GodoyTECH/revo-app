# Organização Revolucionários App

Central Diplomática instalável, mobile first e preparada para funcionar como PWA.

## Logo oficial

Antes de executar o projeto, coloque a identidade oficial em `./logo.png`. O
arquivo não é versionado porque o fluxo de revisão aceita apenas arquivos de
texto. O comando de desenvolvimento e o build verificam obrigatoriamente esse
arquivo e preparam todos os ícones em `public/icons/` sem criar outra marca ou
usar um placeholder.

## Executar localmente

```bash
npm run dev
```

A aplicação fica disponível em `http://localhost:4173`.

## Comandos

- `npm run icons`: recria todos os ícones a partir da identidade visual oficial em `logo.png`.
- `npm test`: valida o manifest, ícones e fluxo de instalação.
- `npm run build`: gera a versão de produção em `dist/`.
