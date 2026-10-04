# Homologação na Railway

Configurar no painel do serviço: Railpack, build `npm run build`, start `HOSTNAME=0.0.0.0 npm start` e healthcheck `/api/health`. Node 24 está definido em `package.json`; a porta vem da Railway. O start existente prepara os ativos e inicia o servidor Next standalone. O painel informa que Config as Code está descontinuado para novos serviços desde 28/08/2026, portanto não depender de `railway.json`.

## Destino

Destino confirmado pelo responsável: projeto `81bb2986-7c95-4ee1-9918-0f22fe72a221`, serviço `portal_leal` (`3975e450-a967-46ef-bb38-b798c969e7f5`), ambiente chamado `production`, utilizado como homologação. Branch preparada: `codex/homologacao`. Domínio existente: `https://portalleal-production.up.railway.app`. Não alterar os demais serviços do projeto.

## Variáveis do serviço do portal

- `APP_ORIGIN`: URL HTTPS exata do domínio da homologação, sem caminho.
- `ANALYTICS_ENABLED=false`: manter assim até configurar/verificar o banco e migrations.
- `LEAL_AUTH_URL`, `LEAL_AUTH_USUARIO`, `LEAL_AUTH_SENHA`: segredos server-only, via Railway; `LEAL_SERVER=SRVW-MIS-01`.
- Banco, quando habilitado: `DATABASE_URL` com usuário restrito, CA confiável (`DATABASE_CA_FILE`) e nome certificado (`DATABASE_TLS_SERVERNAME`, se necessário). No mesmo projeto/ambiente, preferir endereço privado.
- Segredos de analytics e localização: conforme `docs/analytics.md`, sem reutilizar credenciais administrativas como credenciais de runtime.

Não copiar `.env.local`, `.env.database-admin.local` ou certificados do computador para o Git. Não configurar migrations administrativas como parte de `buildCommand` ou `startCommand`. O certificado Railway ainda não foi obtido por canal autenticado; não desativar verificação TLS para contornar essa pendência.

## Escopo funcional desta publicação

Entrada, demonstração fictícia e política de estatísticas podem ser homologadas. O adaptador usa `/SRVW-MIS-01/cadastro_portal/{documento}`. Autenticação real continua bloqueada até implementar persistência de desafios/sessões, verificar OTP e confirmar operação Meta. Alterar a rota não ativa sozinho o fluxo financeiro. Analytics está implementado, mas sua ativação depende de banco, certificado e migração.

Healthcheck confirma o processo HTTP; não comprova banco, autenticação, Meta ou disponibilidade SIC. Verificar separadamente os fluxos habilitados e não declarar a homologação financeira completa com base no healthcheck.

## Verificação após publicação

Conferir SHA implantado, build/deployment concluído, HTTPS, resposta de `/api/health`, ativos/imagens e layout desktop/mobile. Verificar origem autorizada nas APIs e rejeição de origem externa; `.env` e arquivos administrativos devem responder 404. Não usar dados reais para simular uma autenticação que ainda está indisponível. Registrar URL e resultado da verificação no checkpoint de publicação.

Referência: [Railway Config as Code](https://docs.railway.com/config-as-code/reference).
