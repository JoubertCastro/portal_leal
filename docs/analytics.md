# Rastreabilidade e analytics próprios

## Estado e decisões

Implementados: migration PostgreSQL, repositório transacional, coleta de etapas no formulário, preferência explícita, APIs de coleta, instrumentação dos serviços de cadastro/portfólio, retenção, views de funil, campanhas, linha do tempo e mapa. Não há painel administrativo público nem pixels externos.

A aplicação da migration no banco Railway foi tentada, mas a conexão parou em `SELF_SIGNED_CERT_IN_CHAIN`, antes de autenticar/executar DDL. É necessário obter o certificado CA por um canal autenticado (Railway) e configurar `DATABASE_CA_FILE`. Não desativar TLS nem usar `rejectUnauthorized:false`. Se o nome do certificado for interno, configurar `DATABASE_TLS_SERVERNAME` com o nome efetivamente certificado. A coleta real permanece desligada enquanto a configuração não estiver concluída.

A autenticação por WhatsApp continua indisponível. Por isso, preenchimento, tentativa e indisponibilidade podem ser medidos quando analytics for ativado; cadastro e dados financeiros só produzirão eventos quando os serviços reais forem acionados. Não consultamos dívidas antes de autenticar apenas para enriquecer analytics. `authentication_completed` e `agreement_confirmed` estão reservados para as futuras transações oficiais de verificação/confirmação, sem emissões fictícias.

## Pesquisa aplicada

- [ANPD — Cookies e proteção de dados pessoais](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_orientativo_cookies_e_protecao_de_dados_pessoais): transparência e escolhas sobre cookies. A implementação usa consentimento separado para estatísticas; recusar não impede atendimento. Isso não substitui a revisão das finalidades/bases legais pela Leal.
- [CNIL — Audience measurement](https://www.cnil.fr/en/sheet-ndeg16-use-analytics-your-websites-and-applications): referência técnica de minimização; as exceções francesas de consentimento não foram presumidas aplicáveis ao Brasil.
- [MaxMind — Geolocation accuracy](https://support.maxmind.com/knowledge-base/articles/maxmind-geolocation-accuracy): cidade por rede é aproximada; não tratar o ponto como endereço de residência. Usamos coordenadas reduzidas a 0,1 grau, fonte identificada e ausência explícita quando desconhecida.
- [node-postgres — SSL](https://node-postgres.com/features/ssl) e [transações](https://node-postgres.com/features/transactions): validação TLS e um único cliente por transação.
- [PostgreSQL — privilégios](https://www.postgresql.org/docs/current/ddl-priv.html): credencial de runtime separada do administrador e papel de leitura restrito às views.
- [Next.js — after](https://nextjs.org/docs/app/api-reference/functions/after): gravações de eventos do servidor após a resposta para evitar que analytics acrescente latência ao atendimento. Falhas emitem somente um código operacional, sem payload.

## O que é armazenado

Schema `leal_analytics`: `consents`, `consent_history`, `campaigns`, `journeys`, `events`, `rate_limits`.

Uma jornada usa UUID aleatório; identificadores de navegador ficam em cookies assinados HttpOnly, SameSite=Strict e Secure em HTTPS. O browser não escolhe a jornada no payload. A API confirma o consentimento no banco em cada gravação e vincula a jornada ao mesmo comprovante de preferência. Retirada e inserções concorrentes disputam a mesma linha bloqueada, impedindo uma gravação posterior à retirada.

Guardar: horários, etapa, CPF/CNPJ apenas como tipo de documento, dispositivo/navegador em categorias amplas, origem em grupos, campanha cadastrada, localização aproximada confiável, duração de consultas e contagens de registros financeiros após sessão verificada. Não há campo livre JSON para receber dados arbitrários.

Nunca guardar em analytics: CPF/CNPJ bruto, nome, razão social, telefone, IP integral, user-agent integral, URL/referrer integral, GPS, teclas, captura de sessão, OTP, token SIC, saldo ou contrato. Não registrar em logs os argumentos SQL, exceções de banco ou corpos de respostas.

Depois de um documento efetivamente enviado ao serviço de cadastro, eventos do servidor podem receber `subject_key = HMAC-SHA256(documento, segredo externo)`. É pseudonimização, não anonimização. A chave pertence ao evento, não à jornada inteira: se duas pessoas usam o mesmo dispositivo, os eventos de uma não são atribuídos à outra. `subject_verified=false` significa documento alegado; só após sessão válida pode ser true. Formulário preenchido e não enviado não identifica uma pessoa ou CPF específico.

## Etapas e interpretação

| Evento/medida | Origem e significado |
| --- | --- |
| `portal_viewed` | Browser, entrada na página principal após permissão |
| `document_started` | Browser, começou a preencher; sem conteúdo do campo |
| `document_completed` | Browser, documento passou validação local; não comprova cadastro |
| `document_invalid` | Browser, tentativa com documento inválido |
| `access_submitted` | Browser, acionou continuar com documento válido |
| `access_unavailable` | Browser, serviço de acesso retornou indisponibilidade |
| `registration_requested` | Servidor, iniciou consulta ao cadastro |
| `registration_not_found` | Servidor, resposta válida vazia |
| `registration_found` | Servidor, existem registros, mesmo se exigem revisão/atendimento |
| `registration_no_contacts`, `registration_review_required` | Servidor, impedimentos de contato/identidade |
| `registration_failed`, `portfolio_failed` | Servidor, falha não equivale a ausência de dívida |
| `otp_requested` | Emissor aceitou solicitação; não comprova entrega |
| `portfolio_loaded` | Servidor, sessão válida e ambas as consultas concluídas; contagens de dívida/acordo |
| `no_debt_returned` | Nenhum registro de dívida retornado, não “cliente quitado” |
| `has_agreement` | Ao menos um acordo retornado, não necessariamente acordo ativo |
| `help_clicked`, `demo_opened` | Browser, uso de atendimento/demonstração; dados fictícios não geram resultados financeiros |
| `page_hidden`, `page_resumed` | Mudança de visibilidade; não prova fechamento ou abandono |

Abandono é inferido após 30 minutos sem eventos: começou/não concluiu, concluiu/não enviou, enviou/não autenticou. Serviço indisponível, erro, revisão e cadastro ausente são classes separadas. Após navegação/recarregamento com 30 minutos de inatividade, inicia-se nova jornada. Cookies/jornada expiram em até 24 horas. A página aberta sem recarregar permanece na mesma jornada até sua expiração; não interpretar cada intervalo como nova visita.

Timestamps do browser são indicativos e limitados a cinco minutos do relógio do servidor. Para ordenar a linha do tempo, usar `occurred_at` nos eventos do servidor e `received_at` nos eventos do browser. Eventos usam UUID e insert idempotente; retries do browser mantêm o UUID. Fila local apenas em memória, limitada a 100, lotes de 20, quatro tentativas. Nenhuma promessa de rastreabilidade 100%: recusa, bloqueadores, rede, aba encerrada e falhas de infraestrutura afetam a cobertura. Monitorar `ANALYTICS_SERVER_EVENT_NOT_RECORDED` e erros das APIs.

Contagens de jornadas não são pessoas únicas. Não reconstruímos identidade por fingerprint ou IP. Limites no banco são compartilhados, mas não substituem WAF/proteção contra automação no perímetro.

## Consentimento e retenção

Versão `analytics-2026-09-v1`; escolhas equivalentes “Recusar estatísticas” e “Permitir estatísticas”. Registrar comprovante e alterações. Antes da permissão, nada de eventos/jornada analítica. O cookie de preferência é necessário para lembrar a escolha. Existe também uma flag local de recusa para bloquear reativação após falha de rede na retirada; contém somente `1`, não identificadores.

Retirada apaga jornadas/eventos vinculados à preferência; permanece o histórico da escolha até expirar. Eventos/jornadas: 90 dias; preferência: até 180 dias; rate limits vencidos são limpos. `npm run analytics:maintenance` deve ser agendado diariamente na hospedagem. O início de jornada também executa limpeza com um controle compartilhado de uma hora como proteção adicional. Manter alerta para falha/atraso do job. Backups, retenção do provedor e atendimento a direitos exigem procedimento operacional próprio.

## Localização e campanhas

Sem hospedagem confirmada, a localização é `unknown`. Não há chamada a serviço externo com o IP do visitante. A integração de borda aceita `x-leal-geo` com país/região/cidade/coordenadas apenas quando `x-leal-edge-key` coincide com segredo de pelo menos 32 caracteres configurado em `ANALYTICS_EDGE_SECRET`. O proxy confiável deve apagar cabeçalhos recebidos do visitante e injetar novos; bloquear acesso direto à origem. Não expor esse segredo ao frontend. Uma base GeoIP local no proxy é uma opção; a configuração concreta depende da hospedagem.

O mapa agrega apenas localidades com pelo menos cinco preferências distintas (não cinco eventos do mesmo navegador). Pontos representam redes/regiões aproximadas, não pessoas. Relatar a parcela de localização desconhecida em qualquer mapa.

Somente `utm_campaign` com código permitido no catálogo é aceito. Origem/medium vêm do catálogo do servidor, nunca de texto livre da URL. Primeiro contato da jornada é preservado; não há atribuição publicitária individual entre sites. Exemplos de catálogo devem usar nomes não pessoais. Cadastros de campanhas são administrativos, não via API pública.

## Aplicação das migrations e operação

1. Credencial administrativa em `.env.database-admin.local` (ignorado pelo Git, não carregado pelo servidor). Certificado CA obtido na Railway em `DATABASE_CA_FILE` na configuração local. Nunca incluir senha em documentação ou logs.
2. Executar `npm run db:migrate -- --provision`. Migrations usam transaction, advisory lock e checksum. Cria papel `leal_portal_runtime` sem superusuário/DDL e papel `leal_analytics_reader` sem login. A senha aleatória de runtime é escrita somente em `.env.local`, junto com segredos de analytics. Se o papel já existe, não rotacionar automaticamente: configurar sua credencial pelo gestor de segredos.
3. Em produção, distribuir somente `DATABASE_URL` de runtime e segredos necessários ao app. Manter administrador fora do deploy. Limitar número de réplicas × pool de cinco conexões à capacidade do banco; ajustar CONNECTION LIMIT de forma planejada.
4. Agendar limpeza diária e monitorar erros. Configurar CA, domínio HTTPS, `APP_ORIGIN`, backup/restauração e acesso interno do BI. Conferir preferências/textos com o responsável pela privacidade antes de ativação pública.
5. Conferir a conexão, migrations, permissões e coleta com eventos sintéticos antes de visitantes reais. `ANALYTICS_ENABLED=true` só depois dessas verificações. Testes E2E forçam false e usam mocks, sem acesso ao banco real.

## Consultas disponíveis ao BI

```sql
SELECT * FROM leal_analytics.daily_funnel ORDER BY day DESC;
SELECT * FROM leal_analytics.campaign_funnel ORDER BY day DESC;
SELECT * FROM leal_analytics.access_map ORDER BY journeys DESC;
SELECT * FROM leal_analytics.journey_funnel WHERE outcome='completed_not_submitted';
-- Parâmetro de jornada deve ser vinculado, não concatenado em SQL:
SELECT * FROM leal_analytics.timeline WHERE journey_id=$1
ORDER BY CASE WHEN source='server' THEN occurred_at ELSE received_at END, id;
```

Não expor essas views por endpoint público. Conceder o papel reader a um usuário de BI separado, com controle de acesso/auditoria e conexão TLS. A timeline contém resultados financeiros reduzidos e identificadores pseudonimizados; não é um relatório público.
