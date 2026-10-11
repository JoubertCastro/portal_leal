'use client';
export default function ErrorPage({ reset }: { reset: () => void }) { return <main id="conteudo" className="state-page"><h1>Não foi possível abrir esta página.</h1><p>Tente novamente em alguns instantes.</p><button data-track="app.error.1" className="button primary" onClick={reset}>Tentar novamente</button></main>; }
