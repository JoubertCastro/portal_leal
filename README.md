# Portal Leal — área pública

Implementação local do modelo aprovado: hero com foto e glass, marcas parceiras, passo a passo, apresentação institucional, perguntas frequentes e rodapé.

## Executar

- `npm run build`: monta index.html e styles.css a partir do hero aprovado e das seções.
- `npm start`: abre o servidor local em http://127.0.0.1:4174.
- `npm run check`: verifica sintaxe JavaScript.

## Editar

- sections.html e sections.css: seções da página e estilos complementares.
- app.js e access.html: acesso demonstrativo.
- assemble.cjs: composição e conversão de imagens incorporadas para arquivos locais.
- assets/: imagens originais da Leal.

A autenticação é demonstrativa. CPF e código são tratados somente no navegador, sem persistência, transmissão ou consulta real. A validação matemática de CPF não comprova identidade. Integrações de autenticação, envio de código, consulta e negociação de dívidas ficam pendentes.

O Figma original não foi alterado nesta implementação. Fonte: Manrope quando instalada, com Segoe UI e sans-serif como alternativas locais.
