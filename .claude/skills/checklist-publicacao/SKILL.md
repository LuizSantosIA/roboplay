---
name: checklist-publicacao
description: Checklist obrigatório antes de publicar o site (deploy). Use SEMPRE que o usuário disser que vai publicar, subir, fazer deploy, colocar no ar ou lançar o site — ex.: "vou publicar o site", "bora subir", "faz o deploy", "coloca no ar". Confere segredos no código, .env no .gitignore, se o site abre sem erro, português dos textos e faz um commit claro, terminando com um resumo do que passou e do que precisa corrigir.
---

# Checklist de publicação

Rode os 5 itens abaixo **em ordem**, sem pular nenhum, antes de qualquer publicação. Anote o resultado de cada um (✅ passou / ⚠️ atenção / ❌ precisa corrigir) para o resumo final.

Não publique nada por conta própria: o objetivo é deixar tudo pronto e conferido. Se algum item der ❌, avise e pergunte antes de seguir para o commit.

## 1. Chaves de API e senhas no código

Procure segredos nos arquivos versionados (ignore `node_modules/`, `dist/` e `.vercel/`):

- Use `git ls-files` para saber o que vai para o repositório e busque com Grep por padrões como:
  `api[_-]?key`, `secret`, `senha`, `password`, `passwd`, `token`, `bearer`, `private[_-]?key`, `-----BEGIN`, `sk-`, `sk_live_`, `pk_live_`, `AKIA`, `ghp_`, `AIza`, `xox[bp]-`.
- Confira também o histórico recente: `git log -p -n 20` filtrando pelos mesmos padrões — um segredo removido do código ainda fica no histórico.
- Para cada ocorrência, leia o contexto e decida se é segredo real ou falso positivo (nome de variável, texto do jogo, etc.). Só reporte os reais, com arquivo e linha.
- Lembre: neste projeto (Vite) qualquer variável `VITE_*` vai parar no JavaScript do navegador — nunca é lugar para segredo.

## 2. `.env` no `.gitignore`

- Leia o `.gitignore` e confirme que `.env` e `.env.local` (e variações como `.env.*.local`) estão listados.
- Rode `git ls-files | grep -i '\.env'` para garantir que nenhum `.env` já foi commitado antes (estar no `.gitignore` não remove arquivo já rastreado). Se aparecer algum (exceto `.env.example` sem valores reais), é ❌.

## 3. O site abre sem erro

- Rode `npm run build` — tem que terminar sem erro de TypeScript nem do Vite.
- Suba o resultado com `npm run preview` (em segundo plano) e confira que a página responde (ex.: `curl` na URL mostrada, status 200 e HTML com o conteúdo esperado).
- Se houver uma skill/ferramenta de navegador disponível, abra a página e verifique o console: nenhum erro em vermelho ao carregar. Se não houver, diga no resumo que o console não foi verificado.
- Encerre o servidor de preview no fim.

## 4. Português dos textos

- Revise os textos que o usuário vê: `index.html` (título, meta description), strings em `src/` (botões, menus, mensagens, nomes de missões e blocos) e o `README.md`.
- Procure erros de ortografia, acentuação (ex.: "voce", "nao", "missao"), concordância, crase e pontuação, e inconsistências (mesma coisa escrita de jeitos diferentes).
- Liste cada problema como `arquivo:linha — "errado" → "certo"`. Não corrija sozinho: mostre a lista e pergunte se pode aplicar.

## 5. Commit com mensagem clara

- Rode `git status` e `git diff` para ver o que mudou.
- Se houver alterações, faça um commit com mensagem em português que diga **o que** mudou e **por quê** (ex.: `Corrige acentuação nos textos das missões e ajusta título da página`). Nada de "ajustes" ou "update" genéricos.
- Adicione os arquivos pelo nome — nunca inclua `.env`, segredos ou `dist/`.
- Se não houver nada para commitar, registre "árvore limpa, nada a commitar" como ✅.
- Não faça `git push` nem deploy sem o usuário pedir.

## Resumo final

Termine sempre com um resumo neste formato:

```
## Checklist de publicação

| # | Item                          | Resultado |
|---|-------------------------------|-----------|
| 1 | Sem chaves/senhas no código   | ✅ / ⚠️ / ❌ |
| 2 | .env no .gitignore            | ✅ / ⚠️ / ❌ |
| 3 | Site abre sem erro            | ✅ / ⚠️ / ❌ |
| 4 | Português dos textos          | ✅ / ⚠️ / ❌ |
| 5 | Commit antes de publicar      | ✅ / ⚠️ / ❌ |

### ✅ O que passou
- ...

### ❌ O que precisa corrigir
- arquivo:linha — problema — como corrigir

**Pronto para publicar?** Sim / Não (diga o que falta)
```
