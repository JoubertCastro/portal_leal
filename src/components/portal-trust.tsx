import Image from 'next/image';
import pan from '../../public/assets/banco-pan.png';
import recovery from '../../public/assets/recovery.jpg';
import mercadoPago from '../../public/assets/mercado-pago.png';
import arc4 from '../../public/assets/arc4.png';
import btg from '../../public/assets/btg-pactual.png';
import carrefour from '../../public/assets/carrefour.png';
import serasa from '../../public/assets/serasa.png';
import { UiIcon } from './ui-icon';

const partners = [
  { name: 'Banco Pan', image: pan }, { name: 'Recovery', image: recovery },
  { name: 'Mercado Pago', image: mercadoPago }, { name: 'ARC4', image: arc4 },
  { name: 'BTG Pactual', image: btg }, { name: 'Carrefour Soluções Financeiras', image: carrefour },
  { name: 'Serasa', image: serasa },
];

export function PortalTrust() {
  return <>
    <section id="parceiros" className="partners-section" aria-labelledby="partners-title">
      <div className="partners-heading"><span className="eyebrow">BOAS RELAÇÕES. NOVOS CAMINHOS.</span><h2 id="partners-title">A confiança de grandes marcas.<br /><span>O cuidado de quem está perto.</span></h2></div>
      <ul className="partner-grid">{partners.map(partner => <li key={partner.name}><Image src={partner.image} alt={partner.name} sizes="(max-width: 650px) 110px, 140px" /></li>)}</ul>
    </section>
    <section className="portal-steps" aria-labelledby="steps-title">
      <div className="trust-section-heading"><div><span className="eyebrow">SIMPLES EM CADA ETAPA</span><h2 id="steps-title">Você no controle.<br /><em>A gente ao seu lado.</em></h2></div><p>Da primeira consulta ao acompanhamento.<br />Um passo de cada vez, com clareza.</p></div>
      <div className="portal-step-grid">
        <article><div className="step-top"><UiIcon name="shield" /><span className="step-number">01 / ACESSAR</span></div><h3>O primeiro passo<br />é seu.</h3><p>Informe seu CPF e confirme sua identidade pelo WhatsApp cadastrado.</p><span className="step-bottom">Um acesso pessoal <UiIcon name="arrow" /></span></article>
        <article><div className="step-top"><UiIcon name="document" /><span className="step-number">02 / ENTENDER</span></div><h3>Suas opções,<br />com clareza.</h3><p>Confira suas pendências e as condições disponíveis para negociação.</p><span className="step-bottom">Informação para decidir <UiIcon name="arrow" /></span></article>
        <article><div className="step-top"><UiIcon name="check" /><span className="step-number">03 / ACOMPANHAR</span></div><h3>Tudo no<br />seu ritmo.</h3><p>Encontre as informações de seus acordos em um só lugar.</p><span className="step-bottom">Mais organização <UiIcon name="arrow" /></span></article>
      </div>
      <p className="steps-caption">As funcionalidades estarão disponíveis após a integração. As condições variam conforme o credor e a dívida.</p>
    </section>
    <section id="sobre" className="company-section" aria-labelledby="company-title">
      <div className="company-history"><span className="eyebrow">EXPERIÊNCIA QUE APROXIMA</span><span className="history-year">1981<span>O início da nossa história.</span></span></div>
      <div className="company-copy"><h2 id="company-title">Por trás da tecnologia,<br /><em>pessoas de verdade.</em></h2><p>A Leal Assessoria atua na recuperação de crédito e na negociação de dívidas. Nossa experiência e nosso atendimento caminham juntos para ajudar você a dar o próximo passo.</p><a href="https://lealbsb.com.br/sobre.php">Conheça nossa história <UiIcon name="arrow" /></a></div>
    </section>
    <section id="ajuda" className="access-faq" aria-labelledby="faq-title">
      <div><span className="eyebrow">PODE PERGUNTAR</span><h2 id="faq-title">Mais respostas.<br /><em>Menos dúvidas.</em></h2><p className="faq-intro">E, se precisar, nossa equipe está por aqui.</p><a href="https://wa.me/5561995067834"><UiIcon name="message" />Falar com a Leal</a></div>
      <div className="access-questions">
        <details><summary>Por que preciso confirmar minha identidade?</summary><p>Essa etapa protege o acesso às suas informações. O CPF sozinho não libera a consulta de dívidas.</p></details>
        <details><summary>E se eu não tiver acesso ao WhatsApp cadastrado?</summary><p>Fale com a equipe Leal para receber orientação sobre a atualização do cadastro e a confirmação de identidade.</p></details>
        <details><summary>Já tenho um acordo. Onde acompanho?</summary><p>O acompanhamento estará disponível no portal após a integração. Enquanto isso, nossa equipe pode ajudar pelos canais de atendimento.</p></details>
      </div>
    </section>
  </>;
}
