# Administração do Portal Leal

`/admin` é independente das sessões dos clientes. `/demonstracao`, `/homologacao` retornam 404; a antiga API de homologação retorna 410 e não consulta mais o SIC.

## Ativação inicial
1. Aplicar as migrações com `npm run db:migrate`.
2. Com as chaves de autenticação do mesmo ambiente e uma conexão administrativa local, executar `npm run admin:provision -- NUMERO_COM_DDD`. O comando grava apenas a chave HMAC do número autorizado para ativação; não substitui um administrador já ativado.
3. Acessar `/admin` com usuário `admin` e senha inicial `admin`.
4. Informar nova senha de pelo menos 12 caracteres, repeti-la e cadastrar o WhatsApp autorizado.
5. Confirmar o código enviado usando o template de autenticação Meta já configurado. Somente então a senha nova e o telefone passam a valer, as sessões iniciais são revogadas e os relatórios são liberados.

Sem provisionamento, não é possível assumir a conta inicial. A senha pública inicial jamais permite consultar relatórios. Não testar a ativação real com uma senha fictícia: esta etapa pertence ao responsável pelo painel.

## Autenticação
Senha protegida com scrypt e salt aleatório. Telefone criptografado com AES-256-GCM. Código de seis dígitos armazenado somente como HMAC, válido por cinco minutos, com cinco tentativas. Limite global de envios de cinco códigos por hora e intervalo mínimo de 60 segundos por sessão. Dez falhas de senha bloqueiam novas tentativas na janela de 15 minutos. Não há bypass de segundo fator nem código fixo.

Sessão inicial dura 15 minutos. Após o segundo fator, token aleatório rotacionado em cookie HttpOnly/Secure/SameSite=Strict, independente do cliente, com duração máxima de oito horas e inatividade máxima de 30 minutos. Toda API de relatórios verifica a sessão e o estágio no servidor. O painel não participa da coleta de marketing/mapa de cliques.

Troca posterior de telefone, recuperação de acesso e múltiplos administradores não são expostos nesta versão. Exigem procedimento administrativo de identidade e revogação de sessões, sem reabrir automaticamente a senha inicial. Preservar as chaves de criptografia e HMAC durante mudanças de infraestrutura.

## Relatórios
Funil, operações, chamadas de API, desempenho, negociações deduplicadas, timeline, mapa de cliques e regiões. Filtros por período (até 31 dias, data final exclusiva, fuso de São Paulo), e provedor quando aplicável. Paginação de 100 registros. CSV exporta explicitamente a página exibida, com proteção contra fórmulas. Para arquivos completos, usar o exportador administrativo descrito em `observability.md`.

Os cartões do funil agregam todo o período, independentemente da paginação. A grade de cliques mostra somente células da página exibida, agrupadas pelo mesmo controle, tela, viewport e layout. As coordenadas são relativas ao controle; não é uma gravação de sessão. Geografia só aparece com fonte confiável e pelo menos cinco visitantes consentidos no grupo.

`leal_admin.events` registra falhas e etapas de autenticação, saída e acesso a relatórios, sem telefone, senha ou código. Eventos duram até 180 dias com limpeza oportunista no login. Não há endpoint público de exportação nem credencial administrativa de banco no navegador.
