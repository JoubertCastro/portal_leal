# WhatsApp oficial — ativação

O adaptador envia templates de autenticação com botão de copiar código e devolve o ID da mensagem ao emissor interno. Não repete envios ambíguos. Token, código e destino não são registrados. A aceitação pela API não confirma entrega, verificação de identidade ou opt-in.

## Configuração da Meta

No serviço `portal_leal`, configurar `META_GRAPH_VERSION`, `META_PHONE_NUMBER_ID`, `META_ACCESS_TOKEN`, `META_AUTH_TEMPLATE` e `META_AUTH_LANGUAGE`, correspondentes à conta e ao template aprovados. O nome do template, idioma e botão devem corresponder exatamente à configuração Meta. Não colocar segredos em variáveis `NEXT_PUBLIC_*`.

Webhook: `https://portalleal-production.up.railway.app/api/webhooks/whatsapp`. A verificação GET usa `META_WEBHOOK_VERIFY_TOKEN` (segredo aleatório com pelo menos 32 caracteres). POST exige `META_APP_SECRET`, assinatura HMAC SHA-256 do corpo original, `META_WABA_ID` e `META_PHONE_NUMBER_ID`. Assinar o campo `messages` no aplicativo Meta. Não substituir o webhook de outro serviço sem verificar suas responsabilidades.

O receptor armazena apenas hash do ID da mensagem, status e horários. Ignora contas/números diferentes e conteúdo de mensagens recebidas. Não é um chatbot. Eventos duplicados são idempotentes; eventos fora de ordem são preservados sem inferir regressão de estado. Só confirma recebimento de statuses após commit no banco; indisponibilidade retorna 503 para permitir nova entrega da Meta. Limite de corpo 256 KiB e 1.000 statuses por lote. Retenção: 30 dias.

Aplicar `002_whatsapp.sql` com usuário administrativo pelo processo existente, depois conceder permissões ao usuário restrito (`db:migrate -- --provision`). A conexão TLS verificada e a migration ainda precisam ser realizadas na Railway. Enquanto faltar configuração/persistência, não anunciar entrega ou autenticação operacional.

## Login de clientes implementado, aguardando ativação

`CustomerAuthStore` usa PostgreSQL para seleção/desafio/sessão com dados pessoais criptografados por AES-256-GCM e contexto por registro, OTP aleatório de seis dígitos com HMAC, cinco tentativas, validade de cinco minutos, máximo três envios por telefone em 15 minutos e intervalo de um minuto. Reservar o desafio antes do envio evita repetir timeout ambíguo. Consumo único e criação da sessão ocorrem em uma transação com bloqueio de linha. Cookies `__Host-` são Secure, HttpOnly, SameSite Strict; sessão de 30 minutos e revogação ao sair. A interface inclui seleção de telefone mascarado, autorização e preferência opcional separadas, código e portal protegido. `1234` permanece exclusivamente na página restrita de homologação e nunca é enviado pela Meta.

Aplicar também `003_customer_auth.sql` e configurar `AUTH_ENCRYPTION_KEY` (32 bytes em 64 caracteres hex), `AUTH_DIGEST_KEY` (segredo separado com pelo menos 32 caracteres), credenciais SIC e Meta. Somente então habilitar `AUTH_ENABLED=true`, após validação TLS/migração e teste autorizado de envio. Nenhuma rota usa memória local como repositório de autenticação.

Por enquanto, o limite de rede é um teto global conservador de 20 consultas em 15 minutos, além dos limites por documento e navegador. Não usa cabeçalhos IP não autenticados. Antes de ampliar para atendimento público, configurar proteção contra automação/perímetro e identidade de rede confiável; não simplesmente aumentar esse teto como solução de escala.

Agendar `npm run auth:maintenance` ao menos diariamente: seleções/sessões expiradas, desafios com mais de um dia, limites vencidos, consentimentos com mais de 180 dias e eventos de entrega com mais de 30 dias. Validades são conferidas nas consultas mesmo antes da limpeza. Não habilitar comunicações de marketing sem fluxo de cancelamento; a preferência é apenas armazenada e nenhum disparo de campanha foi implementado.

Confirmar template/Phone Number ID/token com o responsável antes do teste de envio e usar somente o telefone cadastrado que ele autorizar. Validar o enquadramento do serviço com a Meta/provedor conforme `integrations.md`.

Referências oficiais: [verificação de webhook](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/webhooks/start/), [exemplo de assinatura Meta](https://github.com/fbsamples/whatsapp-api-examples/tree/main/signature-validation-with-webhooks-payloads).
