import Link from 'next/link';
import Image from 'next/image';
import { Brand } from '@/components/brand';
import { AccessForm } from '@/components/access-form';
import { PortalTrust } from '@/components/portal-trust';
import heroPhoto from '../../public/assets/hero-financas.jpg';

export default function AccessPage() {
  return <div className="access-page">
    <header className="site-header"><Brand /><nav className="access-navigation" aria-label="Navegação principal"><a href="#parceiros">Nossos parceiros</a><a href="#sobre">Sobre a Leal</a><a className="header-help" href="https://wa.me/5561995067834">Precisa de ajuda? <span aria-hidden="true">↗</span></a></nav></header>
    <main id="conteudo">
    <div className="access-layout">
      <section className="access-card" aria-labelledby="access-title">
        <span className="eyebrow">SEU ESPAÇO NA LEAL</span>
        <h1 id="access-title">Acesse seu portal.</h1>
        <p className="lead">Suas pendências e seus acordos,<br className="desktop-break" /> em um só lugar.</p>
        <div className="status-note"><span className="status-dot" />Portal em preparação · atendimento disponível</div>
        <AccessForm />
        <div className="access-support"><p>Não tem acesso ao WhatsApp cadastrado?</p><a href="https://wa.me/5561995067834">Fale com nossa equipe <span aria-hidden="true">↗</span></a></div>
      </section>
      <aside className="welcome-panel" aria-label="Sobre o portal">
        <div className="welcome-photo"><Image src={heroPhoto} alt="Casal analisando suas contas juntos em casa" fill sizes="(max-width: 650px) 100vw, 50vw" priority placeholder="blur" /><span className="heritage-label">LEAL ASSESSORIA · DESDE 1981</span></div>
        <div className="welcome-content"><span className="eyebrow">SEU PRÓXIMO PASSO COMEÇA AQUI</span><h2>Sua dívida tem solução.<br />Seu recomeço também.</h2><p>Consulte suas pendências e encontre uma forma de negociar que faça sentido para você. No seu tempo, de onde estiver.</p>
          <ul className="welcome-benefits"><li>Sem sair de casa</li><li>No seu ritmo</li><li>Com clareza</li></ul>
        </div>
      </aside>
    </div>
    <PortalTrust />
    <div className="experience-preview"><div><strong>Conheça seu espaço na Leal.</strong><p>Explore a demonstração do portal com dados fictícios.</p></div><Link className="button secondary" href="/demonstracao">Explorar demonstração <span aria-hidden="true">→</span></Link></div>
    </main>
    <footer className="site-footer"><span>© {new Date().getFullYear()} Leal Assessoria</span><div><a href="https://lealbsb.com.br/privacidade.php">Privacidade</a><a href="mailto:faleconosco@lealcobra.com.br">Fale conosco</a><a href="tel:+556134246800">(61) 3424-6800</a></div></footer>
  </div>;
}
