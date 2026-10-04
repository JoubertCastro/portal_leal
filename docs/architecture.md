# Arquitetura — checkpoint anterior ao banco

## Decisão

Aplicação modular Next.js/React/TypeScript. Backend for frontend no mesmo deploy, com contratos independentes dos provedores. Sem microserviços ou Redis obrigatórios nesta fase. Fluxo futuro: navegador → handlers → serviços de aplicação → contratos → SIC/Meta e repositórios compartilhados.

`server-only` impede importar integrações e criptografia no cliente. Token SIC autentica uma máquina; sessão do cliente será independente. Demonstração não é fallback de produção.

## Implementado

- Entrada responsiva com CPF/CNPJ, com estado de indisponibilidade real; nenhuma transmissão de documento neste checkpoint.
- Demonstração com visão geral, pendências/detalhes, acordos e atendimento. Dados fictícios segregados.
- SIC: validação da resposta de login, token em cache até 30s antes da expiração, login concorrente compartilhado dentro do processo, renovação uma vez em 401. Timeout de 8s, bloqueio de redirecionamentos e erros sem corpo do provedor.
- Meta: adaptador para template de autenticação com botão de copiar código, sem rota pública de envio. Sem retry automático de POST que possa duplicar mensagem. Aceitação não significa entrega.
- Adaptadores SIC para cadastro, dívidas e acordos com schemas validados e minimização. Serviço de seleção de telefone, escopo por contato e consultas financeiras protegidas por sessão. Repositórios e emissor de desafios ainda dependem de persistência: ver `docs/integrations.md`.
- Tokens de sessão aleatórios e hash; códigos aleatórios e digest HMAC vinculado ao desafio, com segredo externo ao banco.
- APIs bloqueadas antes de ler dados pessoais ou chamar provedores; verificação de origem configurada e Cache-Control no-store.
- Headers básicos, IDs de requisição em erros e workflow de CI.

## Próxima fase: PostgreSQL

Implementar clientes, sessões, desafios, eventos, atribuição e preferências com migrations, índices e retenção por finalidade. SIC segue como fonte oficial das dívidas; armazenar somente referências necessárias e valores monetários em centavos.

Sessão: token de 256 bits; hash no banco; cookie HttpOnly, Secure em HTTPS, SameSite=Lax, Path=/ e sem Domain. Definir validade absoluta, inatividade, revogação e logout. Token SIC nunca fica no cookie.

Desafios: digest HMAC, expiração curta, limite de tentativas, cooldown e vínculo ao navegador. Consumir código e criar sessão na MESMA transação, somente uma vez. Emissão invalida desafios anteriores e aplica limites atomicamente. Comparação de digest deve resistir a vazamento por tempo.

Rate limiting compartilhado por identificador pseudonimizado de cliente e origem de rede confiável. Não confiar cegamente em X-Forwarded-For. Valores definitivos de limites/validade precisam ser definidos antes de ativar autenticação.

Consultas privadas derivam cliente da sessão verificada, nunca de um customerId arbitrário enviado pelo browser. Não revelar cadastro/dívidas antes de verificar identidade. Número mascarado também pode expor informação: definir política antes de exibi-lo. Recuperação de telefone é processo separado; número digitado não comprova titularidade do CPF.

## Escala e operação

Instâncias descartáveis e estado compartilhado no banco. Pool de conexões dimensionado para hospedagem. CDN apenas para conteúdo público; dados privados sem cache compartilhado.

Cache SIC é por instância. Confirmar se a API permite tokens simultâneos da mesma conta. Se novos logins revogarem tokens antigos, será necessária coordenação compartilhada antes de escalar réplicas. Confirmar quotas/capacidade do upstream antes de testes de carga.

Adicionar outbox/filas quando houver webhooks, notificações e conversões assíncronas. Confirmar acordos com idempotência e resultado oficial do upstream. Não expor o GET genérico do adaptador como proxy público, nem repetir mutações automaticamente.

Health atual verifica somente o processo. Produção exige readiness, métricas de latência/erros, alertas, auditoria com retenção, backups e teste de restauração. Nunca registrar CPF, OTP, token, telefone ou payload do provedor nos logs. IDs de correlação não substituem observabilidade completa.

CSP atual é base limitada (frame-ancestors, object-src, base-uri e form-action), não proteção completa contra XSS. Definir nonce/script-src e HTTPS/HSTS na implantação final. APP_ORIGIN deve ser o endereço canônico. Nenhuma autenticação/contador em memória deve substituir persistência compartilhada.

## Analytics e campanhas

Coleta, preferência, repositório PostgreSQL, migrations, retenção e views foram implementados. A configuração remota está bloqueada pela validação TLS do certificado Railway; detalhes e taxonomia atual em [analytics](analytics.md).

Taxonomias de browser e servidor são separadas em `tracking.ts`. Schemas estritos, IDs para deduplicação, cookies assinados e persistência transacional com preferência validada no banco. Resultados do cadastro/portfólio são instrumentados no serviço de acesso; autenticação/acordo definitivo só pode ser emitido na transação oficial futura, nunca pelo browser.

Ativação depende do banco/configuração e de permissão do visitante. Campanhas aceitam apenas códigos do catálogo, sem URLs completas ou parâmetros arbitrários. A primeira campanha da jornada é preservada. Não há pixels; recusar analytics não impede acesso. Views fornecem funil, mapa agregado, campanhas e timeline para BI restrito, sem endpoint público de leitura.

Separar métricas internas de publicidade. Não transmitir CPF, telefone, códigos, dados de dívida ou identificadores derivados desses campos a pixels. Não disparar tags indiscriminadamente nas telas financeiras.

## Experiência e desempenho

Formulário antes do conteúdo auxiliar em mobile. Labels, mensagens de erro, foco visível, navegação por teclado e HTML semântico. A entrada combina foto e parceiros da versão pré-aprovada com a arquitetura do portal. Imagens via Next Image com dimensões/sizes definidos; foto prioritária e parceiros com carregamento sob demanda. Fontes de sistema, sem downloads remotos.

Playwright cobre desktop e viewport mobile; não substitui aparelhos reais, Safari ou leitor de tela. Medir LCP, INP e CLS em produção, além de testes de carga sem dados reais. Não afirmar pontuação Lighthouse ou capacidade de usuários sem medição.

## Critérios para habilitar acesso real

1. Contrato de cadastro publicado e validado, com identidade estável e telefone confiável.
2. Banco, migrations, retenção, sessões e limites compartilhados implementados.
3. Conta Meta e template aprovados; envio/entrega validados com destinatário autorizado.
4. Jornada de autenticação, revogação, autorização, recuperação e concorrência testadas.
5. Observabilidade redigida, infraestrutura HTTPS e tratamento de indisponibilidade.
6. Preferências e armazenamento de eventos antes de ativar analytics.

Referências: https://nextjs.org/docs/app/guides/authentication e https://nextjs.org/docs/app/guides/backend-for-frontend e https://support.google.com/analytics/answer/6366371.
