import Link from 'next/link';
import { Brand } from '@/components/brand';
import { AccessForm } from '@/components/access-form';

export default function AccessPage() {
  return <div className="access-page">
    <header className="site-header"><Brand /><a className="header-help" href="https://wa.me/5561995067834">Precisa de ajuda? <span aria-hidden="true">↗</span></a></header>
    <main id="conteudo" className="access-layout">
      <section className="access-card" aria-labelledby="access-title">
        <span className="eyebrow">SEU ESPAÇO NA LEAL</span>
        <h1 id="access-title">Acesse seu portal.</h1>
        <p className="lead">Suas pendências e seus acordos,<br className="desktop-break" /> em um só lugar.</p>
        <div className="status-note"><span className="status-dot" />Portal em preparação · atendimento disponível</div>
        <AccessForm />
        <div className="access-support"><p>Não tem acesso ao WhatsApp cadastrado?</p><a href="https://wa.me/5561995067834">Fale com nossa equipe <span aria-hidden="true">↗</span></a></div>
      </section>
      <aside className="welcome-panel" aria-label="Sobre o portal">
        <div className="welcome-top"><span className="small-caps">LEAL ASSESSORIA</span><span>Desde 1981</span></div>
        <div className="welcome-content"><span className="panel-symbol" aria-hidden="true">↗</span><h2>Mais clareza para<br />o seu próximo passo.</h2><p>Um acesso simples para acompanhar o que importa e encontrar um caminho para seguir.</p>
          <ul className="feature-list"><li><span>01</span> Consulte suas pendências</li><li><span>02</span> Conheça suas opções de negociação</li><li><span>03</span> Acompanhe seus acordos</li></ul>
        </div>
        <div className="preview-link"><span>Conheça a experiência</span><Link href="/demonstracao">Explorar demonstração <span aria-hidden="true">→</span></Link><small>Somente dados fictícios. Nenhum acesso real.</small></div>
      </aside>
    </main>
    <footer className="site-footer"><span>© {new Date().getFullYear()} Leal Assessoria</span><div><a href="https://lealbsb.com.br/privacidade.php">Privacidade</a><a href="tel:+556134246800">(61) 3424-6800</a></div></footer>
  </div>;
}
