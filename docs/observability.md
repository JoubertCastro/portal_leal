# Rastreabilidade do portal

## Plano executado
1. Auditar ações do servidor e cada chamada externa SIC, ARC4 e Meta, com correlação por operação.
2. Ampliar o funil até simulação, confirmação, boleto e encaminhamento humano.
3. Instrumentar controles com IDs fixos, coordenadas relativas e versão de layout, mediante consentimento.
4. Criar consultas organizadas e exportação CSV restrita para análise e preparação de relatórios.
5. Validar isolamento, proteção de dados, idempotência e migrações antes de ativar.

## Tabelas e consultas
- `leal_audit.actions`: operação, horário, resultado, identidade criptografada e chaves HMAC para correlação. Independente da preferência de estatísticas.
- `leal_audit.api_calls`: uma linha por chamada externa, incluindo renovação de token, paginação e tentativas. Método, provedor, endpoint parametrizado, HTTP, erro categorizado e duração. Não armazena payload, URL real, tokens, cabeçalhos ou PDFs.
- `leal_audit.integration_report`: junção organizada por trace/call, com número da chamada e identificação pseudonimizada. Não expõe identidade criptografada.
- `leal_audit.negotiations`: propostas confirmadas deduplicadas por ID em todo o histórico retido; usar para contar negociações sem contar reenvios como novos acordos.
- `leal_audit.daily_integrations`: volumes, falhas, chamadas incompletas e p95 de duração.
- `leal_audit.operational_funnel`: tentativas e documentos distintos por etapa/dia/resultado; não representa visitantes anônimos. `confirmed_quotes` deduplica confirmações da mesma proposta dentro de cada grupo; não somar entre dias como novos acordos.
- `leal_analytics.events`: timeline de eventos browser/servidor, vinculados a jornadas consentidas.
- `leal_analytics.interactions`: metadados validados de clique, sem texto/valor digitado.
- `leal_analytics.daily_funnel_v2`: jornadas consentidas por data, campanha e dispositivo; identificação, encontrado/não encontrado, autenticação, dívidas, acordos existentes, simulação, negociação, boleto e encaminhamento.
- `leal_analytics.heatmap_cells`: células de 10% por controle/página/tela/layout/dispositivo. Cliques por teclado ficam sem coordenadas; não devem ser desenhados em um ponto fictício.
- `leal_analytics.access_map`: geografia aproximada, somente de perímetro autenticado, com supressão de grupos menores que cinco preferências distintas.

## Leitura correta dos indicadores
Jornadas não são pessoas únicas. Recarregar uma página não aumenta o número de jornadas dentro da janela ativa. Eventos financeiros aceitos pelo browser são proibidos: resultados vêm do servidor. O histórico da jornada pode conter mais de um documento em dispositivo compartilhado; o identificador pertence ao evento, não à jornada inteira.

O funil de navegação mede somente usuários que consentiram; bloqueadores, falhas de rede e limites de coleta reduzem a cobertura. O campo `human_handoff` significa clique no canal humano, não conversa realizada. `whatsapp_accepted` significa aceitação pela API Meta, não entrega/leitura. Falta de resposta numa chamada financeira é resultado desconhecido e nunca autoriza repetir um acordo automaticamente.

A demonstração também pode gerar cliques consentidos (`page=demo` no mapa). Não gera resultados financeiros reais. O funil total de jornadas pode incluir demonstração; filtrar a timeline/mapa ao comparar páginas.

## Operação e segurança
Aplicar `npm run db:migrate` antes de ativar `AUDIT_ENABLED=true` e `ANALYTICS_ENABLED=true`. A auditoria exige as chaves de autenticação existentes: HMAC com separação de propósito e AES-256-GCM com AAD por registro. As chaves analíticas dedicadas são opcionais: na ausência delas, derivam de `AUTH_DIGEST_KEY` com namespaces separados. Rotacionar chaves exige planejamento de leitura do histórico.

O runtime grava auditoria sem permissão de exclusão direta. A função de expurgo é restrita. Se não for possível registrar o início da operação/chamada, a integração não é executada. Operações interrompidas permanecem explicitamente incompletas. Logs técnicos usam códigos fixos, nunca erros brutos do provedor.

Retenção: navegação 90 dias, preferências 180 dias, auditoria 180 dias. A retirada do consentimento elimina as jornadas/eventos/interações associados; não elimina comprovantes operacionais automaticamente. Há manutenção oportunista ao iniciar jornadas e operações auditadas. Executar também `npm run analytics:maintenance` diariamente no agendador da infraestrutura para expurgo mesmo sem tráfego; a auditoria remove até 2.000 operações por execução, portanto aumentar a frequência se houver acúmulo. O agendamento não é criado pelo aplicativo.

## Exportação
O papel `leal_analytics_reader` possui somente views de relatórios; configurar uma conexão de leitura em `DATABASE_REPORT_URL`. A ferramenta administrativa também aceita `DATABASE_ADMIN_URL` local, sem publicar essas credenciais no frontend. Exemplo (data final exclusiva, horário de São Paulo, máximo 31 dias):

```powershell
npm run analytics:export -- integrations 2026-10-10 2026-10-11 arc4
npm run analytics:export -- negotiations 2026-10-10 2026-10-11
npm run analytics:export -- operations 2026-10-10 2026-10-11
npm run analytics:export -- funnel 2026-10-10 2026-10-11
npm run analytics:export -- heatmap 2026-10-10 2026-10-11
```

CSV fica em `exports/` (ignorado pelo Git), protegido contra fórmulas de planilha e limitado a 100 mil linhas. Exportação de integração exige filtro de provedor: `arc4`, `sic` ou `meta`. Revisar escopo e destinatário antes de compartilhar. Não há envio automático ao banco parceiro nem painel administrativo público. O dashboard visual do mapa/funil poderá consumir essas views; esta entrega implementa coleta, armazenamento e relatórios tabulares.

## Evolução
Novos controles precisam de `data-track` e entrada no catálogo `src/domain/interaction-catalog.ts`; alterar a versão de layout quando mudar a geometria. Novos provedores devem usar `requestJson` e cadastrar classificação de endpoint em `src/server/audit.ts`. Nunca inserir parâmetros reais em `endpoint_template`.
