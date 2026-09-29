# Jornal de Turismo

Site editorial estático para `jornaldeturismo.rio.br`, com foco em viagens, hospitalidade e aviação, integrado ao Correio Content Hub.

## Cloudflare Pages

- Framework preset: **None**
- Build command: `npm run build`
- Build output directory: `dist`
- Branch de produção: `main`
- Deploy manual: execute `npx wrangler pages deploy dist --project-name jornal-de-turismo --branch main` na raiz do repositório.

A rota `/api/articles` é uma Pages Function que consulta o Hub no servidor, evitando dependência de CORS no navegador. A resposta tem cache de edge de 60 segundos, usa o último resultado por até 24 horas quando o Hub falha e o navegador mantém uma cópia local por até 7 dias. Se não houver conteúdo do Hub, as chamadas da página mantêm a edição editorial estática.

Imagem de abertura: “Rio de Janeiro beach scene (Unsplash)”, de Wolf Schram, via Wikimedia Commons, publicada sob CC0.
