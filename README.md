# Portal do Cliente Leal — checkpoint de arquitetura

Next.js App Router, React e TypeScript estrito. Entrada centrada no acesso do cliente e demonstração isolada em `/demonstracao`. Requer Node.js 24. As versões exatas estão no package-lock.json.

## Executar

- `npm ci`: instala as dependências.
- `npm run dev`: servidor de desenvolvimento em http://127.0.0.1:4174.
- `npm run build` e `npm start`: build e servidor de produção local.
- `npm run check`, `npm run lint` e `npm test`: tipos, lint e testes de domínio/integrações simuladas.
- `npx playwright install chromium` e `npm run test:e2e`: jornadas desktop/mobile. Encerre servidores manuais na porta 4174 antes dos testes.

## Estrutura

- `src/app`: páginas e handlers HTTP.
- `src/components`: componentes de interface.
- `src/domain`: regras e contratos independentes de banco/provedor.
- `src/server`: integrações SIC/Meta, segurança e composição server-only.
- `src/demo`: dados fictícios exclusivos da demonstração.
- `public/assets`: ativos originais; a nova entrada carrega somente o logo.
- `legacy`: protótipo preservado como referência, fora do app e do build. Não usar seus scripts para gerar o portal novo.
- `tests`: regras, integrações simuladas e jornadas E2E.

## Estado funcional

O CPF é validado localmente e **não é enviado** neste checkpoint. A demonstração é pública e identificada; não autentica ninguém. `/portal` redireciona à entrada; `/api/me` retorna 401. Autenticação e analytics retornam 503 para a origem autorizada: não há sucesso simulado nem coleta descartada silenciosamente.

**Não há autenticação real, envio WhatsApp, consulta de dívidas, pagamento, criação de acordo ou persistência de analytics habilitados.** O adaptador Meta precisa de validação com a conta oficial e template aprovado. Sessões/códigos dependem de armazenamento compartilhado; não usamos memória do processo como substituto do banco.

Copie `.env.example` para `.env.local` para configuração futura. Configure `APP_ORIGIN=http://127.0.0.1:4174` localmente. Nenhuma credencial é necessária para a prévia. Nunca colocar segredos em variáveis `NEXT_PUBLIC_*` ou no Git.

## Arquitetura e publicação

Leia [a arquitetura](docs/architecture.md) e [as integrações](docs/integrations.md). O workflow de CI executa lint, tipos, testes, build e jornadas desktop/mobile sem credenciais reais.

Este checkpoint pode ser publicado como prévia. Produção transacional depende dos critérios documentados. O build usa `output: standalone`; `npm start` prepara os ativos e inicia esse servidor (padrão local: 127.0.0.1:4174). Na hospedagem configure HOSTNAME=0.0.0.0 e PORT conforme o ambiente. Em imagens imutáveis, copie public e .next/static para o standalone na etapa de build e execute diretamente node .next/standalone/server.js.

O Figma original não foi alterado. A interface usa fontes do sistema e não carrega fontes remotas ou pixels de terceiros.
