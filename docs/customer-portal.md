# Área autenticada

Atualizada em 05/10/2026 seguindo o layout de `/demonstracao`, com dados exclusivamente de `/api/me` e sem importar fixtures da demonstração.

- Visão geral: soma dos saldos de dívidas retornadas, quantidade de acordos e parcela de menor vencimento sem pagamento informado. Os saldos de dívidas não são somados aos acordos, evitando contagem duplicada.
- Pendências: credor, produto, final do contrato, saldo, situação original e vencimento. Saldo zero não é interpretado como quitação.
- Acordos: progresso baseado nas datas de pagamento, parcelas retornadas e aviso quando a relação estiver incompleta. Ausência de pagamento não implica classificação automática como atraso ou quebra.
- Atendimento: canais da Leal, sem incluir CPF, contrato ou valores nas URLs externas.
- Falhas: carregamento, nova tentativa, redirecionamento de sessão inválida, limpeza dos dados na expiração e ao sair. Nenhum dado financeiro é persistido no navegador.

O OpenAPI publicado foi consultado em 05/10/2026: `cadastro_portal/{id}`, `divida/{id}` e `acordos/{id}` continuam disponíveis, com `id` string. Os schemas de resposta 200 estão vazios; permanecem as validações explícitas dos contratos SIC já integrados. Não há operação documentada para emitir boleto/Pix ou criar acordo pelo portal. O endpoint de pagamentos por intervalo não é uma emissão de pagamento nem uma consulta autorizada por cliente, portanto não foi exposto.

Validação: `npm test` inclui renderização da carteira; `npm run test:portal` usa credenciais fictícias, cabeçalhos de sessão apenas no servidor local de teste e interceptação de `/api/me`. Nenhuma chamada real à Meta/SIC/banco é necessária nesses testes. A rota e a sessão reais continuam protegidas sem modo de bypass no aplicativo.
