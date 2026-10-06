# Área autenticada

Atualizada em 05/10/2026 seguindo o layout de `/demonstracao`, com dados exclusivamente de `/api/me` e sem importar fixtures da demonstração.

- Visão geral: soma dos saldos de dívidas retornadas, quantidade de acordos e parcela de menor vencimento sem pagamento informado. Os saldos de dívidas não são somados aos acordos, evitando contagem duplicada.
- Pendências: credor, produto, final do contrato, saldo, situação original e vencimento. Saldo zero não é interpretado como quitação.
- Acordos: progresso baseado nas datas de pagamento, parcelas retornadas e aviso quando a relação estiver incompleta. Ausência de pagamento não implica classificação automática como atraso ou quebra.
- Atendimento: canais da Leal, sem incluir CPF, contrato ou valores nas URLs externas.
- Falhas: carregamento, nova tentativa, redirecionamento de sessão inválida, limpeza dos dados na expiração e ao sair. Nenhum dado financeiro é persistido no navegador.

O OpenAPI publicado foi consultado em 05/10/2026: `cadastro_portal/{id}`, `divida/{id}` e `acordos/{id}` continuam disponíveis, com `id` string. Os schemas de resposta 200 estão vazios; permanecem as validações explícitas dos contratos SIC já integrados. Não há operação documentada para emitir boleto/Pix ou criar acordo pelo portal. O endpoint de pagamentos por intervalo não é uma emissão de pagamento nem uma consulta autorizada por cliente, portanto não foi exposto.

Validação: `npm test` inclui renderização da carteira; `npm run test:portal` usa credenciais fictícias, cabeçalhos de sessão apenas no servidor local de teste e interceptação de `/api/me`. Nenhuma chamada real à Meta/SIC/banco é necessária nesses testes. A rota e a sessão reais continuam protegidas sem modo de bypass no aplicativo.

## Personalização autenticada (06/10/2026)

A saudação usa `Nome` do cadastro, preservando ordem e grafia. A consulta ocorre após validar a sessão, CPF/CNPJ e vínculo do código interno; a chave normalizada de comparação de nomes não é usada como nome de apresentação. O contrato completo (`cartao`, sem espaços externos e sem conversão numérica) é retornado apenas na carteira autenticada e exibido nas pendências. Nenhum desses campos é enviado à telemetria ou aos links de atendimento.

Rótulos internos no formato `CREDOR n` são removidos do produto apresentado. Logos de PAN, BTG, Carrefour e Serasa reutilizam os arquivos do portal. TW Capital: arquivo obtido em https://www.twcapital.com.br/ (asset oficial https://static.wixstatic.com/media/af409f_f65f0f4c63ff46b097efaaafcafafa1a~mv2.png). As imagens são servidas localmente, sem requisições do cliente a terceiros; nomes desconhecidos ficam em texto, sem associação presumida.
