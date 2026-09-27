import Image from 'next/image';
import pan from '../../public/assets/banco-pan.png';
import recovery from '../../public/assets/recovery.jpg';
import mercadoPago from '../../public/assets/mercado-pago.png';
import arc4 from '../../public/assets/arc4.png';
import btg from '../../public/assets/btg-pactual.png';
import carrefour from '../../public/assets/carrefour.png';
import serasa from '../../public/assets/serasa.png';

const partners = [
  { name: 'Banco Pan', image: pan }, { name: 'Recovery', image: recovery },
  { name: 'Mercado Pago', image: mercadoPago }, { name: 'ARC4', image: arc4 },
  { name: 'BTG Pactual', image: btg }, { name: 'Carrefour Soluções Financeiras', image: carrefour },
  { name: 'Serasa', image: serasa },
];

export function PortalTrust() {
  return <>
    <section id="parceiros" className="partners-section" aria-labelledby="partners-title">
      <div className="partners-heading"><span className="eyebrow">CONFIANÇA QUE CONSTRÓI CAMINHOS</span><h2 id="partners-title">Marcas que confiam em nosso trabalho</h2></div>
      <ul className="partner-grid">{partners.map(partner => <li key={partner.name}><Image src={partner.image} alt={partner.name} sizes="(max-width: 650px) 110px, 140px" /></li>)}</ul>
    </section>
    <section className="portal-steps" aria-labelledby="steps-title">
      <div className="trust-section-heading"><span className="eyebrow">DO ACESSO AO ACORDO</span><h2 id="steps-title">Mais clareza. Menos complicação.</h2></div>
      <div className="portal-step-grid">
        <article><span className="step-number">01</span><h3>Acesse com segurança</h3><p>Informe seu CPF e confirme sua identidade pelo WhatsApp cadastrado.</p></article>
        <article><span className="step-number">02</span><h3>Conheça suas opções</h3><p>Confira suas pendências e as condições disponíveis para negociação.</p></article>
        <article><span className="step-number">03</span><h3>Acompanhe seus acordos</h3><p>Encontre as informações de seus acordos em um só lugar.</p></article>
      </div>
      <p className="steps-caption">As funcionalidades estarão disponíveis após a integração. As condições variam conforme o credor e a dívida.</p>
    </section>
    <section id="sobre" className="company-section" aria-labelledby="company-title">
      <div><span className="eyebrow">AO SEU LADO DESDE 1981</span><h2 id="company-title">Tecnologia para facilitar.<br />Pessoas para ajudar.</h2></div>
      <div><p>A Leal Assessoria atua na recuperação de crédito e na negociação de dívidas. Nossa experiência e nosso atendimento caminham juntos para ajudar você a entender suas opções e dar o próximo passo.</p><a href="https://lealbsb.com.br/sobre.php">Conheça a Leal <span aria-hidden="true">↗</span></a></div>
    </section>
    <section id="ajuda" className="access-faq" aria-labelledby="faq-title">
      <div><span className="eyebrow">PODEMOS AJUDAR</span><h2 id="faq-title">Dúvidas antes<br />de começar?</h2><a href="https://wa.me/5561995067834">Fale com nossa equipe ↗</a></div>
      <div className="access-questions">
        <details><summary>Por que preciso confirmar minha identidade?</summary><p>Essa etapa protege o acesso às suas informações. O CPF sozinho não libera a consulta de dívidas.</p></details>
        <details><summary>E se eu não tiver acesso ao WhatsApp cadastrado?</summary><p>Fale com a equipe Leal para receber orientação sobre a atualização do cadastro e a confirmação de identidade.</p></details>
        <details><summary>Já tenho um acordo. Onde acompanho?</summary><p>O acompanhamento estará disponível no portal após a integração. Enquanto isso, nossa equipe pode ajudar pelos canais de atendimento.</p></details>
      </div>
    </section>
  </>;
}
