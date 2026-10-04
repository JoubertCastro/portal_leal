import Link from 'next/link';
export const metadata={title:'Privacidade das estatísticas'};
export default function AnalyticsPrivacy(){
  return <main id="conteudo" style={{maxWidth:760,margin:'60px auto',padding:24,lineHeight:1.7}}><Link href="/">← Voltar ao portal</Link><h1>Estatísticas com a sua escolha</h1>
  <p>A Leal usa estatísticas próprias para entender dificuldades no acesso e melhorar o atendimento. A coleta analítica é opcional. Você pode permitir, recusar ou alterar sua escolha no botão “Preferências de estatísticas”.</p>
  <h2>O que registramos</h2><p>Etapas de navegação, início e conclusão do preenchimento, tentativas de acesso, resultados das consultas autorizadas, horários, categoria do dispositivo e navegador, campanha cadastrada e localização aproximada de cidade/região, quando disponível por uma fonte confiável.</p>
  <p>Não gravamos teclas, imagens da sessão, o conteúdo dos campos, GPS, IP completo, telefone, senha, códigos de acesso, valores de dívidas ou números de contratos nas estatísticas. Após uma consulta enviada, um identificador protegido pode relacionar jornadas ao mesmo documento, sem guardar o CPF/CNPJ nessa base. Esse identificador continua sendo dado pessoal pseudonimizado.</p>
  <h2>Cookies e conservação</h2><p>A preferência vale por até 180 dias. A jornada tem duração máxima de 24 horas e uma nova jornada é iniciada após 30 minutos de inatividade. Eventos e jornadas são eliminados após 90 dias pelo processo de retenção. Não compartilhamos esses eventos com pixels publicitários.</p>
  <p>Ao recusar nas preferências, a coleta é interrompida e as jornadas vinculadas a essa preferência são excluídas. O comprovante da escolha pode permanecer até o término de sua validade. A recusa não impede acesso ou atendimento.</p>
  <h2>Limitações e contato</h2><p>A localização é aproximada e pode refletir uma rede ou provedor, não seu endereço. O mapa mostra grupos de acessos, não a localização individual de clientes. Ausência de eventos não comprova ausência de visita.</p><p>Para informações e exercício de direitos, consulte a <a href="https://lealbsb.com.br/privacidade.php">política de privacidade da Leal</a> ou escreva para <a href="mailto:faleconosco@lealcobra.com.br">faleconosco@lealcobra.com.br</a>.</p>
  </main>;
}
