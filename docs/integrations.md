# Integrações — confirmado e pendente

## SIC

POST /auth/login recebe JSON usuario/senha. Resposta observada na investigação anterior: access_token, token_type, expires_in, expires_at e usuario. Validade observada de 43.200 segundos. Nenhuma credencial é versionada.

OpenAPI: https://ophthalmic-stefany-semiempirical.ngrok-free.dev/openapi.json

A API publicada contém GET /{server}/cadastro. O endpoint /{CPF}/cadastro proposto colide no formato. Sugestão para o responsável pela API: POST /portal/cadastro/consulta com CPF no corpo ou outra rota distinta. Nenhum adaptador de cadastro foi inventado; o contrato de domínio é interno, não o schema da SIC.

Confirmar respostas para encontrado com dívida, encontrado sem dívida, não encontrado, telefone indisponível e falhas. Também: ID estável, telefone confiável, valores monetários, paginação, status dos acordos, quotas, tokens simultâneos e endereço estável de produção. Falha/timeout nunca significa ausência de dívida.

## Meta

Adaptador preparado para template de autenticação com código no body e botão de copiar código. Configuração server-only: versão Graph, phone number ID, token, nome do template e idioma. Nenhuma versão Graph é imposta pelo exemplo; escolher versão suportada no momento da ativação.

Testes usam fetch simulado, sem envio real. Conferir payload com template aprovado na conta oficial. Webhooks assinados, entrega/rejeição e idempotência serão implementados com persistência. Não há rota pública que aceite telefone/código para disparar mensagens.

## HTTP atual

Erros: `{ error: { code, message }, requestId }`. Cache-Control: no-store.

| Rota | Resultado |
| --- | --- |
| GET /api/health | 200; processo ok, autenticação indisponível, analytics desativado |
| GET /api/me | 401 UNAUTHENTICATED |
| POST /api/auth/challenges | 403 se origem não autorizada; senão 503 AUTH_UNAVAILABLE |
| POST /api/auth/verify | 403 se origem não autorizada; senão 503 AUTH_UNAVAILABLE |
| POST /api/events | 403 se origem não autorizada; senão 503 ANALYTICS_UNAVAILABLE |

O formulário não transmite CPF neste checkpoint. Contratos HTTP definitivos de desafio, verificação e cookies dependem da persistência. Não substituir 503 por sucesso fictício.
