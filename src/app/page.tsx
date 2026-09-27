import Link from 'next/link';
import Image from 'next/image';
import { Brand } from '@/components/brand';
import { AccessForm } from '@/components/access-form';
import { PortalTrust } from '@/components/portal-trust';
import { UiIcon } from '@/components/ui-icon';
import heroPhoto from '../../public/assets/hero-financas.jpg';

export default function AccessPage() {
  return <div className="access-page">
    <header className="site-header"><Brand /><nav className="access-navigation" aria-label="Navegação principal"><a className="section-nav" href="#parceiros">Parceiros</a><a className="section-nav" href="#sobre">A Leal</a><a className="header-help" href="https://wa.me/5561995067834"><UiIcon name="message" />Ajuda</a><a className="header-access" href="#cpf">Acessar portal <UiIcon name="arrow" /></a></nav></header>
    <main id="conteudo">
    <div className="access-layout">
      <section className="access-card" aria-labelledby="access-title">
        <div className="access-card-top"><span className="access-emblem"><UiIcon name="shield" /></span><span>SEU ESPAÇO NA LEAL</span><span className="card-corner" aria-hidden="true">↗</span></div>
        <h1 id="access-title">Acesse seu portal.</h1>
        <p className="lead">Suas pendências e seus acordos, em um só lugar.</p>
        <ol className="access-progress" aria-label="Etapas de acesso"><li aria-current="step"><span>1</span>Identificação</li><li><span>2</span>Confirmação</li></ol>
        <AccessForm />
        <div className="access-support"><UiIcon name="headset" /><div><p>Precisa de ajuda para entrar?</p><a href="https://wa.me/5561995067834">Conte com nossa equipe <span aria-hidden="true">↗</span></a></div></div>
        <p className="availability-note"><span className="status-dot" />Portal em preparação. Atendimento disponível.</p>
      </section>
      <div className="hero-intro"><span className="eyebrow"><span className="eyebrow-line" />UM NOVO OLHAR PARA O SEU AMANHÃ</span><h2>Seu próximo capítulo.<br /><em>Com mais leveza.</em></h2><p>Um caminho mais simples para entender suas pendências, encontrar opções e seguir em frente.</p></div>
      <figure className="hero-portrait"><Image src={heroPhoto} alt="Casal analisando suas contas juntos em casa" fill sizes="(max-width: 760px) 100vw, 50vw" priority placeholder="blur" /><figcaption><span>No seu tempo.<br /><strong>Do seu jeito.</strong></span><span className="photo-arrow" aria-hidden="true">↗</span></figcaption><div className="heritage-seal"><span>AO SEU LADO</span><strong>1981</strong><span>DESDE O INÍCIO</span></div></figure>
    </div>
    <PortalTrust />
    <div className="experience-preview"><div><span className="eyebrow">UM PORTAL FEITO PARA VOCÊ</span><strong>Suas informações. Um só lugar.</strong><p>Conheça a experiência em uma demonstração com dados fictícios.</p></div><Link className="button secondary" href="/demonstracao">Explorar demonstração <UiIcon name="arrow" /></Link></div>
    </main>
    <footer className="site-footer"><span>© {new Date().getFullYear()} Leal Assessoria · Desde 1981</span><div><a href="https://lealbsb.com.br/privacidade.php">Privacidade</a><a href="mailto:faleconosco@lealcobra.com.br">Fale conosco</a><a href="tel:+556134246800">(61) 3424-6800</a></div></footer>
  </div>;
}
