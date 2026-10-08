# ARC4 / BTG Agreements V2 — leitura e arquitetura

Checkpoint: 07/10/2026. Fonte: **Arc Documentação - Agreements Negotiate V2.pdf**, 83 páginas, capa versão 2022-07-15. Leitura integral do texto e inspeção visual das rotas, autenticação e fluxos ilustrados. Exemplos do PDF não são cadastros autorizados para testes.

## Estado real deste checkpoint

- Autenticação OAuth validada em produção em 07/10/2026: sucesso, Bearer, `expires_in=3600`. Nenhum CPF consultado, oferta persistida, acordo criado ou boleto obtido nesse teste.
- Implementados `Arc4Client`, OAuth com cache e renovação, consultas de saldo e acordos com validação e paginação limitada, e registro extensível de provedores com vínculo explícito por contrato SIC.
- Em 08/10/2026, consultas reais com o CPF autorizado confirmaram um contrato SIC `ARC4U` e sua correspondência exata em `contracts` de um acordo BTG. Saldo retornou zero produtos, inclusive com `includeInAgreement` e `includeInInhibition`. A primeira página e o prefixo `/v2/negotiation/customers` funcionaram; múltiplas páginas continuam cobertas apenas por testes sintéticos. Diagnóstico com os próprios adapters passou: um vínculo, zero saldos, um acordo.
- Corrigida a validação SIC que rejeitava contratos alfanuméricos, preservando o número integral e a rejeição de URLs, markup e caracteres de controle.
- Detalhe do acordo consultado em 08/10/2026: `Acordo Liquidado`, uma parcela de índice 1 com estado `PAID`; documento, ID e todos os contratos de origem conferiram. Nenhum boleto foi solicitado. Esse cadastro não permite validar um boleto pendente nem uma simulação de nova dívida. A numeração observada nesse caso não estabelece uma regra universal para outros acordos.
- Nenhuma rota pública, componente, runtime ou configuração de deploy usa esse conector ainda. Credenciais não foram gravadas no repositório. O portal atual permanece com o SIC.
- Políticas, simulação sem persistência, detalhe de acordo e consulta de boletos estão implementados no adapter, sem rotas públicas. **Formalização não está implementada nem liberada**. Este checkpoint ainda não habilita a integração no portal/Railway.

### Validação adicional em produção — 08/10/2026

- Os três cadastros autorizados para negociação retornaram, cada um, um contrato negociável correspondente ao SIC e uma política com cinco datas de pagamento. Em dois cadastros havia também um produto BTG fora do vínculo SIC; ele foi excluído.
- Simulação HTTP 200 nos três cadastros, documento/contrato conferidos, uma opção retornada e `simulated=true` explícito. Nenhuma oferta persistida ou acordo formalizado por solicitação do conector.
- Primeiro ensaio de simulação retornou 422: entrada separada só é permitida para duas ou mais parcelas. O adapter usa `installmentEntry=0` em pagamento à vista e a entrada mínima da política em parcelamento, sem flags para ignorar validações. A política e o saldo são reconsultados antes da simulação.
- O caso inicialmente indicado para boleto tem a parcela de 08/10/2026 paga: BTG `FINALIZED` / `PAID`, SIC com pagamento preenchido. Não solicitar boleto nesse caso.
- O novo caso de acordo retornou `VALIDATED` / “Aguardando Pagamento”, três parcelas de índices 1, 2 e 3. Adesão com vencimento em 07/10/2026. O GET de adesão retornou PDF válido de 58.898 bytes, ID correspondente, código de barras de 44 dígitos e linha de 47 dígitos. Validação repetida com o próprio adapter e diagnóstico SIC passou. O PDF/linha digitável não foram gravados nem publicados.
- Parcelas futuras podem omitir `status`; normalizado para `null` (desconhecido), sem inferir pagamento. Bloqueios de boleto consideram também o estado oficial do acordo.
- Demais boletos implementados com verificação de índice, acordo ativo/em atraso e propriedade completa; **ainda não validados em produção**: o caso atual aguarda adesão. Não usar esse teste para afirmar que emissão de parcelas posteriores já foi homologada.

## Inventário do contrato

Rotas relativas a `customers/{document}`, com CPF/CNPJ da sessão autenticada:

| Operação | Método e sufixo | Observação | PDF |
|---|---|---|---|
| Autenticar máquina | POST no Cognito `/oauth2/token` | Basic client ID/secret, form `grant_type=client_credentials`; validade de uma hora | 6–7 |
| Consultar dívidas | GET `/balance` | Produtos, contratos, saldo e parcelas; paginação; flags de acordos/inibição | 8–13 |
| Consultar política | GET `/policies` | `contracts` obrigatório; datas, descontos, entrada e parcelas permitidos | 14–20 |
| Simular / gerar oferta | POST `/offers` | `simulated=true` não persiste; o padrão documentado é **false** | 21–33 |
| Formalizar acordo | POST `/agreements` | `offerId`, parcelas e métodos de pagamento; header `createdBy` | 34–37 |
| Cancelar acordo | DELETE `/agreements/{id}` | Restrições de bureau e pagamento; fora do escopo inicial | 38–39 |
| Listar acordos | GET `/agreements` | Filtros e paginação; ID GUID próprio da BTG | 40–48 |
| Detalhar acordo | GET `/agreements/{id}` | Parcelas, contratos originais, estado; muitos campos internos | 49–69 |
| Obter boleto de adesão | GET `/agreements/{id}/first-payment` | PDF base64, código de barras e linha digitável; geração após formalização | 70–71 |
| Obter boleto de parcela | GET `/agreements/{id}/installment/{installment}/bankslip` | PDF base64 e dados da parcela | 72–74 |
| Alçada | Flags na oferta/acordo | Aprovação assíncrona; não habilitar descontos extraordinários no autoatendimento inicial | 75–80 |
| Assinatura | Estado do acordo / método de pagamento | Pode exigir aceite no aplicativo BTG antes do boleto | 81–82 |

Página 5 consolida as rotas; página 83 encerra o documento. Não há especificação de webhook, SLA, quota, garantia de idempotência ou definição completa dos erros.

## Pontos que exigem confirmação

1. **Identificação ARC4 no SIC confirmada pelo usuário em 08/10/2026: `ARC4U`.** O conector aceita somente esse valor exato no credor do registro SIC (`Banco`, exposto internamente como `creditor`). Um vínculo para BTG genérico, ARC4 ou outro nome é rejeitado. Ainda é necessário confirmar o vínculo dos contratos; o nome sozinho não habilita consultas. Código estável de carteira poderá substituir essa identificação textual quando disponibilizado.
2. **Vínculo confirmado em 08/10/2026:** usuário confirmou `cartao` como contrato; consulta real confirmou igualdade exata com um contrato original em `contracts` do acordo BTG. `arc4Bindings` usa o valor integral retornado pelo SIC, apenas para `ARC4U`. Não cortar zeros, remover prefixos ou usar os quatro últimos dígitos. O contrato renegociado do acordo não substitui seus contratos originais.
3. **Acordos:** `codigo_do_acordo` numérico do SIC não é o GUID da BTG. Relacionar por contratos originais e evidência do provedor; não converter IDs ou inferir apenas por valor/data.
4. **URL confirmada em produção para saldos/acordos:** `https://agreements-api.btgpactual.com/v2/negotiation/customers/{document}`. Não acrescentar outro `/v2`, apesar das divergências dos exemplos do PDF.
5. **Formalização:** a página 37 mostra GET com body, mas a lista da página 5 define POST. Tratar como divergência do manual; confirmar a rota atual antes de qualquer mutação. `createdBy` é descrito como bureau no token, sem o nome exato da claim.
6. **Parcelas:** exemplo da página 74 usa `/installment/1`, mas retorna `installment: 0`. Não reutilizar automaticamente a numeração SIC. Validar com um acordo real. Boleto de adesão possui rota própria.
7. **Políticas:** há grafias divergentes (`minimumInstalmentAmount`/`minimumInstallmentAmount`, listas de métodos). Capturar fixtures sanitizadas reais antes de concluir schemas.
8. Confirmar quota, timeout recomendado, paginação/base do índice, contrato sem dívidas, formato dos erros e semântica de repetição de emissão de boleto.

## Arquitetura proposta

Manter o monólito modular Next.js e o PostgreSQL compartilhado. Cada novo credor implementa um adaptador server-only; componentes recebem DTOs comuns, nunca respostas brutas. Não acrescentar um serviço por credor nesta fase.

Fluxo: **sessão verificada → autorização do registro SIC → vínculo do contrato ao provedor → serviço da operação → adaptador ARC4 → DTO mínimo**.

O navegador seleciona apenas o ID opaco do recurso e a ação. CPF, credor, contrato externo, URL e credenciais são resolvidos no servidor. A mesma pessoa pode ter contratos ARC4 e Carrefour: cada contrato tem provedor e capacidades próprios.

O `CreditorRegistry` inicial exige correspondência exata de `Codigo_Interno`, credor e contrato. Registro sem vínculo retorna indisponibilidade da integração e faz **zero requisições**, inclusive OAuth. Duplicidade de mapeamento ou alteração do contrato bloqueia a chamada. A lista de dívidas usada no registro deve vir do SIC com o escopo validado da sessão, nunca do body do navegador.

Na ligação com o portal, extrair a validação de sessão do serviço atual para reutilizar em cada operação; validar também revogação, expiração e vínculo ao navegador. Reconsultar a autorização do contrato antes de ações financeiras. O registro não substitui essa autenticação.

### Capacidades e consultas sob demanda

- O portfólio SIC continua disponível independentemente de falhas ARC4.
- Não consultar todos os credores ao carregar `/api/me`. Consultar políticas ao abrir negociação e boletos ao solicitar o documento.
- Capacidades futuras por contrato: consultar condições, simular, formalizar, boleto de adesão, boleto de parcela. Não disponibilizar botão até vínculo e capacidade estarem validados.
- Respostas da BTG podem incluir outros contratos do CPF: filtrar pelo vínculo autorizado. Para acordos consolidados, **todos os contratos de origem** precisam estar no escopo autorizado; caso contrário, bloquear a exposição e encaminhar ao atendimento.
- Não usar número de contrato final, nome aproximado ou logo como prova de propriedade.

### Persistência para a próxima etapa

Migrations ainda não criadas: faltam o contrato de mapeamento e a validação dos identificadores reais.

- Cadastro de provedores/carteiras: código estável, provedor, versão e capacidades habilitadas; sem segredos no banco.
- Vínculos: registro SIC, referência do sujeito com HMAC, provedor e contrato externo cifrado; unicidade por registro/provedor, auditoria de aprovação e versão do vínculo.
- Ofertas: referência opaca, sujeito, contratos, política, valor/prazos e validade do provedor; snapshot mínimo cifrado, retenção limitada. Nenhum payload de comissões.
- Operações: chave idempotente por intenção, hash canônico do pedido, vínculo, estado, ID externo, datas e resultado minimizado. Índice único impede duas instâncias de executar a mesma intenção.
- Auditoria: operação, provedor, estado, latência e correlação aleatória. Sem CPF, token, linha digitável ou PDF nos logs/analytics.

### Formalização sem duplicidade

1. Consultar dívida e política atuais; simular explicitamente com `simulated=true` e sem alçada extraordinária.
2. Exibir credor, contratos, entrada, parcelas, total, datas e condições para confirmação do cliente.
3. Persistir intenção única no PostgreSQL. Gerar oferta persistida apenas após confirmação, com validação dos termos apresentados. Se mudarem, pedir nova confirmação.
4. Formalizar usando IDs/métodos derivados da oferta validada, não valores livres do navegador. `fingerprint` não é documentado como idempotência.
5. Timeout após POST gera estado **resultado desconhecido**; reconciliar por oferta/acordo antes de considerar nova execução. Não repetir POST cegamente.
6. Processamento, alçada e assinatura são estados próprios. HTTP 409 não significa necessariamente falha permanente. Polling limitado, com intervalo e ação manual de atualização; nenhum loop sem prazo.

### Boletos

Validar sessão, vínculo e propriedade completa do acordo antes da consulta. Não aceitar um GUID arbitrário apenas por ter formato válido. O GUID e a parcela devem ser resolvidos a partir de um recurso previamente autorizado.

Não confundir adesão com a parcela zero. Não recalcular linha digitável, valor ou vencimento. Validar o ID do acordo retornado e a parcela quando presentes. Para primeiro pagamento, conferir `idAgreement`; para demais, `agreementId`.

O adapter valida base64 canônico, tamanho máximo de PDF de 512 KiB, assinatura `%PDF-`, ID do acordo e índice retornado. O JSON continua limitado a 1 MiB. O futuro endpoint deve servir como attachment autenticado, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`; evitar URL pública, PDF no banco ou redirecionamento para URL arbitrária do provedor. Tratar boleto pago, expirado ou pendente como estados próprios somente quando comprovados pela resposta. Limite maior requer alteração explícita e teste do transporte.

### Escala e operação

OAuth tem cache por processo e login concorrente compartilhado. Renovação antecipada em 30s; uma única repetição de GET após 401. Sem retry automático de 429/5xx. Confirmar se tokens simultâneos são permitidos antes de aumentar réplicas.

Reutilizar rate limiting persistido por sessão/sujeito e acrescentar quota/concurrency por provedor antes da exposição HTTP. Circuit breaker e backoff com jitter devem isolar indisponibilidade sem derrubar o portfólio SIC. Evitar manter transações SQL abertas durante chamadas externas; usar claims com prazo para trabalhos assíncronos.

Instâncias sem estado de negócio em memória. Tokens de serviço podem ser locais; acordos, intenções e estado de execução precisam de persistência compartilhada. Não fazer testes de carga na API de produção sem limites acordados.

Valores BTG podem ter mais de duas casas decimais. O adaptador preserva o valor original; cálculos financeiros futuros exigem decimal exato/representação adequada, nunca reutilizar o parser SIC que rejeita frações de centavo nem calcular condições no browser.

## Configuração e validação

Credenciais server-only: `ARC4_CLIENT_ID` e `ARC4_CLIENT_SECRET`. URLs oficiais fixas no adaptador, sem destino arbitrário por request. `INTEGRATION_KEY=btg_agreements_v2` identifica o adaptador; `AI_TOOL_NAME` não é requisito HTTP desse manual e não cria uma ferramenta de IA no portal.

`npm run arc4:check` carrega `.env.local` e o opcional `.env.arc4.local` ignorado pelo Git. Testa somente OAuth e imprime status sanitizado, nunca token ou documento. Não carrega fixtures do PDF nem emite boletos.

`npm run arc4:check-customer` exige `ARC4_TEST_DOCUMENT` explicitamente autorizado, além das credenciais SIC/ARC4. Valida cadastro, escopo SIC, vínculo ARC4U, saldos e acordos. Apenas imprime contagens; não grava respostas reais, envia OTP, cria acordo ou solicita boleto. É um diagnóstico administrativo, não uma rota de login.

Modo opcional `ARC4_TEST_MODE=simulate` simula a primeira política do primeiro contrato autorizado negociável, explicitamente sem persistência. `ARC4_TEST_MODE=first-payment` obtém e valida o PDF de adesão de um acordo `VALIDATED` autorizado, sem nenhuma parcela já paga. Esses modos exigem a autorização do operador para o cadastro utilizado. Saída restrita a status/contagens/tamanho do PDF, sem documentos ou dados de cobrança. Credenciais e CPFs de teste não fazem parte do código ou das fixtures.

Testes automatizados cobrem isolamento por registro/contrato, nenhuma chamada para credor sem vínculo, ambiguidades, documento divergente na resposta, paginação repetida/truncada, precisão, renovação OAuth, limites de retry e mensagens sanitizadas. Testes sintéticos não confirmam a semântica da API real.

Próximos gates: boleto posterior com adesão já efetivada; confirmação do header `createdBy` e formalização; persistência idempotente; rotas autenticadas e testes de propriedade/concorrência; UI de revisão; teste ponta a ponta; então ativação gradual no Railway.
