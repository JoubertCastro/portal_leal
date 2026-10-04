# Integrações — cadastro, dívidas e acordos

Atualização de 04/10/2026: o fluxo completo de código/sessão, a persistência e os webhooks estão implementados no código, mas a ativação aguarda configuração Meta, TLS e migrações. O detalhamento atual está em [whatsapp.md](whatsapp.md). Os trechos abaixo que descrevem dependências futuras registram o checkpoint anterior à implementação. A homologação restrita já consultou os endpoints reais com autorização; nenhum WhatsApp foi enviado.

## SIC

POST /auth/login recebe JSON usuario/senha. Resposta observada na investigação anterior: access_token, token_type, expires_in, expires_at e usuario. Validade observada de 43.200 segundos. Nenhuma credencial é versionada.

OpenAPI: https://ophthalmic-stefany-semiempirical.ngrok-free.dev/openapi.json

As três rotas foram reconferidas no OpenAPI em 04/10/2026: cadastro passou a `/{server}/cadastro_portal/{id}`; dívida e acordos mantêm os caminhos anteriores. Todos exigem HTTPBearer. O schema de sucesso ainda é vazio no Swagger. `SicGateway` preserva os contratos fornecidos pelo responsável, com testes sintéticos, sem copiar dados reais para fixtures.

| Operação | Caminho | Resultado interno |
| --- | --- | --- |
| Cadastro | `/{server}/cadastro_portal/{documento}` | Contatos deduplicados e vínculos por código interno |
| Dívidas | `/{server}/divida/{documento}` | Credor, produto, final do contrato, descrição original, data e centavos |
| Acordos | `/{server}/acordos/{documento}` | Agrupamento por código interno/acordo e parcelas deduplicadas |

`getSicGateway()` compõe os adaptadores com `LEAL_SERVER=SRVW-MIS-01`. O token de serviço autentica a máquina, nunca o cliente. CPF/CNPJ preservam zeros iniciais e têm dígitos verificadores validados; CNPJ alfanumérico é aceito pelo validador.

O responsável confirmou que `id` é o CPF também para dívida/acordos e que `pagamento`, quando preenchido, retorna a data do pagamento. O adaptador já aceita `null` ou data ISO local conforme os exemplos; outros formatos são rejeitados. Saldo zero não é interpretado como quitação, nem `pagamento: null` como atraso. Descrições não determinam elegibilidade de negociação.

Schemas limitam tamanho de listas/campos, validam datas, IDs, centavos e documento de todas as linhas. Documento divergente, identidade conflitante no escopo autorizado e duplicatas inconsistentes falham integralmente. Campos extras são descartados. Dados preparados para o navegador não contêm nome completo, CPF/CNPJ ou número completo de contrato.

HTTP exige HTTPS, mesma origem configurada, caminhos internos restritos, nenhum redirecionamento, `no-store`, timeout de 8 segundos, JSON e limite de 1 MiB inclusive durante leitura. Listas têm limites de 500 cadastros/dívidas e 2.000 parcelas; excessos falham sem truncamento silencioso. Erros não carregam corpo/URL do provedor ou dados pessoais.

Confirmar paginação, status, limites, quotas, tokens simultâneos e endereço estável de produção. Falha/timeout nunca significa ausência de dívida.

## Seleção e autorização

`CustomerAccessService` implementa a preparação de contatos e a consulta financeira protegida por sessão. Depende de interfaces de armazenamento compartilhado, rate limiting e emissão de desafios. Essas dependências ainda não têm implementação de produção; nenhuma autenticação em memória foi instalada no runtime.

1. Limites por rede confiável, navegador e documento são aplicados antes da SIC. As chaves usam HMAC com segredo externo de pelo menos 32 bytes; não confiar em X-Forwarded-For arbitrário.
2. A seleção expira em cinco minutos. Documento, identidade normalizada e vínculos ficam no servidor. Retornar só telefones mascarados e IDs aleatórios de 256 bits; salvar hash do token da seleção e do vínculo ao navegador.
3. O repositório deve reivindicar a opção atomicamente, respeitando navegador, validade e uso único. O browser não escolhe um telefone livre nem códigos internos.
4. O emissor futuro deve persistir desafio/consentimentos, impor quotas por destinatário/documento e tratar entrega ambígua. Consumir OTP e criar sessão exige transação única. Preferências só se tornam confirmadas após verificação.
5. A sessão herda apenas códigos internos vinculados ao telefone escolhido. A consulta financeira valida token, vínculo ao navegador, verificação, validade e revogação antes de chamar a SIC. Documento vem do escopo persistido, nunca do parâmetro de uma rota pública.

Regra confirmada para PF: todos os pares de nomes distintos do cadastro do mesmo CPF precisam atingir pelo menos 60% de semelhança. Normalizar acentos, caixa, pontuação, espaços e ordem das palavras; calcular `1 - distância de Levenshtein / maior comprimento`, sem arredondar antes de comparar. Exatamente 60% passa; abaixo disso bloqueia. Não usar maioria, média ou encadeamento transitivo. Mais de 32 nomes distintos exige atendimento, limitando o custo de comparação. O percentual é uma regra de compatibilidade textual, não uma probabilidade de identidade.

Para PJ, o responsável confirmou razão social digitada seguida de código no telefone cadastrado da empresa. A razão social deve coincidir após normalização (o limiar de 60% é exclusivo de PF), e todos os registros precisam ter razão social consistente. Não revelar a razão social correta como dica. Essa conferência não substitui o OTP nem constitui, isoladamente, comprovação de representação legal.

Nomes aceitos são preservados no escopo do servidor por código interno e telefone. Consultas financeiras exigem um desses nomes já conferidos para o mesmo código; não fazem novas aproximações que ampliem progressivamente a identidade. Cadastro ausente, sem telefone ou inconsistente produz a mesma resposta pública de atendimento. Registros sem telefone não recebem autorização por compartilharem o documento. A jornada pública permanece desativada até persistência e verificação de OTP estarem implementadas.

Números mascarados ainda permitem inferir cadastro e finais de telefone. Antes de ativar a seleção, implementar proteção contra automação no perímetro e monitoramento de abuso. Rate limiting não elimina sozinho a enumeração distribuída.

## Meta

Adaptador preparado para template de autenticação com código no body e botão de copiar código. Configuração server-only: versão Graph, phone number ID, token, nome do template e idioma. Nenhuma versão Graph é imposta pelo exemplo; escolher versão suportada no momento da ativação.

Testes usam fetch simulado, sem envio real. Conferir payload com template aprovado na conta oficial. Webhooks assinados, entrega/rejeição e idempotência serão implementados com persistência. Não há rota pública que aceite telefone/código para disparar mensagens.

O serviço exige autorização explícita para enviar o código, separada da preferência opcional por comunicados. Textos e versão estão em `WHATSAPP_NOTICES` e `WHATSAPP_NOTICE_VERSION`. A interface futura deve apresentar as duas escolhas desmarcadas e não condicionar acesso à segunda. Guardar finalidade, versão, destino e horários, confirmar a preferência após OTP e permitir cancelamento. Receber um código não significa autorização ampla para mensagens. Ajustar categorias ao conteúdo efetivamente autorizado antes de ativar.

A [política oficial do WhatsApp Business](https://business.whatsapp.com/policy?lang=pt_BR), consultada em 27/09/2026, inclui cobrança de dívidas entre serviços restritos. Conta oficial e template aprovado não bastam para presumir autorização. Confirmar o caso com a Meta/provedor antes de habilitar envio; não contornar restrições usando outro tipo de template.

## Proteção de dados e ativação

Minimização e testes técnicos não equivalem a certificação LGPD. Definir base legal/finalidade, retenção/exclusão, acesso administrativo, resposta a incidentes e exercício de direitos com o responsável pela privacidade. O [glossário da ANPD](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/glossario-anpd) descreve consentimento como manifestação livre, informada e inequívoca para finalidade determinada.

No armazenamento futuro, criptografar documentos, telefones e escopos com chaves externas ao banco; guardar hash de tokens e HMAC dos códigos. Separar acessos operacional/analítico. Testar restauração, revogação e concorrência. Não registrar payloads, documentos, telefones ou segredos em logs, APM e pixels.

Como a API recebe documento no caminho, redigir URLs também nos logs do provedor, proxy e ngrok. O portal sozinho não garante a proteção desses logs. Produção precisa de domínio estável, credenciais exclusivas com menor privilégio e rotação de segredos.

Pendências: implementar armazenamento compartilhado e emissão/verificação; conectar handlers e interface de seleção/razão social; confirmar elegibilidade Meta. A jornada pública continua bloqueada até essas etapas. Não houve consulta financeira real nem envio de mensagens neste checkpoint.

## HTTP atual

Erros: `{ error: { code, message }, requestId }`. Cache-Control: no-store.

| Rota | Resultado |
| --- | --- |
| GET /api/health | 200; processo ok, autenticação indisponível, analytics desativado |
| GET /api/me | 401 UNAUTHENTICATED |
| POST /api/auth/challenges | 403 se origem não autorizada; senão 503 AUTH_UNAVAILABLE |
| POST /api/auth/verify | 403 se origem não autorizada; senão 503 AUTH_UNAVAILABLE |
| POST /api/events | 403 se origem não autorizada; senão 503 ANALYTICS_UNAVAILABLE |

O formulário não transmite CPF/CNPJ neste checkpoint. Contratos HTTP definitivos de desafio, verificação e cookies dependem da persistência. Não substituir 503 por sucesso fictício.
