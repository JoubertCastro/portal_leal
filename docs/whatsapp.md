# WhatsApp oficial — ativação

O adaptador envia templates de autenticação com botão de copiar código e devolve o ID da mensagem ao emissor interno. Não repete envios ambíguos. Token, código e destino não são registrados. A aceitação pela API não confirma entrega, verificação de identidade ou opt-in.

## Configuração da Meta

No serviço `portal_leal`, configurar `META_GRAPH_VERSION`, `META_PHONE_NUMBER_ID`, `META_ACCESS_TOKEN`, `META_AUTH_TEMPLATE` e `META_AUTH_LANGUAGE`, correspondentes à conta e ao template aprovados. O nome do template, idioma e botão devem corresponder exatamente à configuração Meta. Não colocar segredos em variáveis `NEXT_PUBLIC_*`.

Webhook: `https://portalleal-production.up.railway.app/api/webhooks/whatsapp`. A verificação GET usa `META_WEBHOOK_VERIFY_TOKEN` (segredo aleatório com pelo menos 32 caracteres). POST exige `META_APP_SECRET`, assinatura HMAC SHA-256 do corpo original, `META_WABA_ID` e `META_PHONE_NUMBER_ID`. Assinar o campo `messages` no aplicativo Meta. Não substituir o webhook de outro serviço sem verificar suas responsabilidades.

O receptor armazena apenas hash do ID da mensagem, status e horários. Ignora contas/números diferentes e conteúdo de mensagens recebidas. Não é um chatbot. Eventos duplicados são idempotentes; eventos fora de ordem são preservados sem inferir regressão de estado. Só confirma recebimento de statuses após commit no banco; indisponibilidade retorna 503 para permitir nova entrega da Meta. Limite de corpo 256 KiB e 1.000 statuses por lote. Retenção: 30 dias.

Em 04/10/2026 foram aplicadas as migrations 001, 002 e 003 no PostgreSQL da Railway e criado o papel restrito `leal_portal_runtime`. A CA pública foi obtida no volume pelo painel autenticado (fingerprint SHA-256 `00:E5:94:5B:EB:C9:8D:D6:E1:B6:CE:07:1E:98:05:7B:70:E6:49:D8:07:5E:5B:9C:99:79:5B:5F:90:D5:79:97`). O certificado servidor é assinado por essa CA e tem SAN `localhost`; configurar `DATABASE_TLS_SERVERNAME=localhost` junto de `DATABASE_CA_PEM` ou `DATABASE_CA_FILE`. A validação da cadeia e do nome continua obrigatória. As credenciais restritas foram guardadas apenas no ambiente local ignorado pelo Git, aguardando configuração no serviço do portal. Enquanto faltar configuração, não anunciar autenticação operacional.

## Login de clientes implementado, aguardando ativação

`CustomerAuthStore` usa PostgreSQL para seleção/desafio/sessão com dados pessoais criptografados por AES-256-GCM e contexto por registro, OTP aleatório de seis dígitos com HMAC, cinco tentativas, validade de cinco minutos, máximo três envios por telefone em 15 minutos e intervalo de um minuto. Reservar o desafio antes do envio evita repetir timeout ambíguo. Consumo único e criação da sessão ocorrem em uma transação com bloqueio de linha. Cookies `__Host-` são Secure, HttpOnly, SameSite Strict; sessão de 30 minutos e revogação ao sair. A interface inclui seleção de telefone mascarado, autorização e preferência opcional separadas, código e portal protegido. `1234` permanece exclusivamente na página restrita de homologação e nunca é enviado pela Meta.

Aplicar também `003_customer_auth.sql` e configurar `AUTH_ENCRYPTION_KEY` (32 bytes em 64 caracteres hex), `AUTH_DIGEST_KEY` (segredo separado com pelo menos 32 caracteres), credenciais SIC e Meta. Somente então habilitar `AUTH_ENABLED=true`, após validação TLS/migração e teste autorizado de envio. Nenhuma rota usa memória local como repositório de autenticação.

Por enquanto, o limite de rede é um teto global conservador de 20 consultas em 15 minutos, além dos limites por documento e navegador. Não usa cabeçalhos IP não autenticados. Antes de ampliar para atendimento público, configurar proteção contra automação/perímetro e identidade de rede confiável; não simplesmente aumentar esse teto como solução de escala.

Agendar `npm run auth:maintenance` ao menos diariamente: seleções/sessões expiradas, desafios com mais de um dia, limites vencidos, consentimentos com mais de 180 dias e eventos de entrega com mais de 30 dias. Validades são conferidas nas consultas mesmo antes da limpeza. Não habilitar comunicações de marketing sem fluxo de cancelamento; a preferência é apenas armazenada e nenhum disparo de campanha foi implementado.

Confirmar template/Phone Number ID/token com o responsável antes do teste de envio e usar somente o telefone cadastrado que ele autorizar. Validar o enquadramento do serviço com a Meta/provedor conforme `integrations.md`.

Referências oficiais: [verificação de webhook](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/webhooks/start/), [exemplo de assinatura Meta](https://github.com/fbsamples/whatsapp-api-examples/tree/main/signature-validation-with-webhooks-payloads).

## Preparação do teste real na Railway

Destino: serviço `portal_leal`, ambiente `production` utilizado como homologação. O arquivo local `.env.railway-whatsapp.local` (ignorado pelo Git) contém a conexão privada `postgres.railway.internal:5432`, com o usuário restrito `leal_portal_runtime`, a CA e as chaves individuais do portal. A conexão pública fica apenas no ambiente local para administração. Não usar o usuário administrador `postgres` na aplicação.

No painel Variables, os campos Meta são preparados vazios. Preencher:

| Variável | Valor |
| --- | --- |
| `META_GRAPH_VERSION` | Versão suportada selecionada no aplicativo Meta, formato `vNN.N` |
| `META_PHONE_NUMBER_ID` | ID do número remetente (não o telefone com DDD) |
| `META_ACCESS_TOKEN` | Token de acesso com permissão de envio para esse número |
| `META_AUTH_TEMPLATE` | Nome exato do template aprovado de autenticação com botão copiar código |
| `META_AUTH_LANGUAGE` | Idioma aprovado do template; preparado como `pt_BR` |
| `META_WABA_ID` | ID da conta WhatsApp Business proprietária do número |
| `META_APP_SECRET` | Segredo do aplicativo Meta usado na assinatura dos webhooks |
| `META_WEBHOOK_VERIFY_TOKEN` | Valor gerado no arquivo local; copiar também para a configuração do webhook na Meta |

Copiar também `AUTH_ENCRYPTION_KEY` e `AUTH_DIGEST_KEY` do arquivo local para seus campos na Railway, preservando os valores gerados. Não compartilhar esse arquivo nem colocá-lo no repositório. Manter as credenciais SIC e `APP_ORIGIN` existentes. A CA é multilinha: colar o conteúdo completo entre BEGIN e END, incluindo essas linhas, sem as aspas externas do arquivo dotenv.

Depois de preencher, configurar `HOMOLOGATION_ENABLED=false` e `AUTH_ENABLED=true`, aplicar as alterações e aguardar o deploy. Configurar o callback acima na Meta, informar o mesmo verify token e assinar `messages`. O login continuará indisponível enquanto faltarem as variáveis essenciais. `/api/health` indica configuração, mas não comprova entrega de mensagem nem conectividade com todos os provedores.

Teste de aceite pelo responsável, usando a página inicial pública (não `/homologacao`):

1. Informar um CPF autorizado com telefone cadastrado sob seu controle e escolher o número mascarado.
2. Autorizar a mensagem de autenticação; a preferência por comunicados é opcional e independente.
3. Solicitar o código e confirmar o recebimento efetivo no WhatsApp. O código tem seis dígitos e expira em cinco minutos; `1234` não autentica nesse fluxo.
4. Confirmar o código, acessar as dívidas e os acordos retornados pelo SIC e verificar que nenhum dado financeiro aparece antes da autenticação.
5. Sair e confirmar que o portal volta a exigir login. Verificar a chegada dos status assinados em `leal_whatsapp.delivery_events` (receber HTTP 200 no envio sozinho não comprova entrega).

Configuração vazia, token expirado, template incompatível ou falha de banco devem impedir o acesso, sem recorrer a código fixo. Os testes automatizados simulam a Meta; só a execução acima comprova o caminho real. Agendar a manutenção diária descrita acima antes do uso contínuo.
