'use client';
import { useEffect, useState } from 'react';
import type { CustomerDebt, CustomerAgreement } from '@/server/integrations/sic';
import Link from 'next/link';
import {CreditorIdentity} from './creditor-identity';
import { Brand } from './brand';
import { CreditorActions } from './creditor-actions';
const money = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n / 100);
const date = (s: string) => s.split('-').reverse().join('/');
const tabs = [{ id: 'inicio', label: 'Visão geral', icon: '◫' }, { id: 'pendencias', label: 'Minhas pendências', icon: '≡' }, { id: 'acordos', label: 'Meus acordos', icon: '✓' }, { id: 'ajuda', label: 'Atendimento', icon: '?' }] as const;
type Tab = typeof tabs[number]['id'];
export interface Portfolio {
    customerName?: string | null;
    debts: CustomerDebt[];
    agreements: CustomerAgreement[];
}
export function PortfolioContent({ data, tab }: {
    data: Portfolio;
    tab: Tab;
}) {
    const unpaid = data.agreements.flatMap(agreement => agreement.installments.filter(p => !p.paidAt).map(installment => ({ agreement, installment }))).sort((a, b) => a.installment.dueDate.localeCompare(b.installment.dueDate));
    const next = unpaid[0];
    return <>
    {tab === 'inicio' && <><div className="summary-grid"><article className="summary-card"><span>Saldo total consultado</span><strong>{money(data.debts.reduce((sum, d) => sum + d.balanceCents, 0))}</strong><small>{data.debts.length} registros de dívida</small></article><article className="summary-card"><span>Acordos encontrados</span><strong>{String(data.agreements.length).padStart(2, '0')}</strong><small>{unpaid.length} parcelas sem pagamento informado</small></article><article className="summary-card accent"><span>Um passo de cada vez</span><h2>Conte com a Leal.</h2><a href="https://wa.me/5561995067834">Conversar com nossa equipe ↗</a></article></div><section className="content-card"><div className="section-heading"><h2>Parcela a acompanhar</h2><span className="badge">Menor vencimento sem pagamento informado</span></div>{next ? <div className="payment-row"><div><strong><CreditorIdentity name={next.agreement.creditor}/></strong>{next.agreement.product&&<p>{next.agreement.product}</p>}<p>Parcela {next.installment.number} de {next.agreement.totalInstallments} · {date(next.installment.dueDate)}</p></div><strong className="payment-value">{money(next.installment.amountCents)}</strong></div> : <p className="portal-empty">Nenhuma parcela sem pagamento informado foi retornada nesta consulta.</p>}</section><p className="portal-footnote">O saldo consultado não é uma oferta de negociação. Dívidas e acordos podem se referir ao mesmo contrato; seus valores não são somados entre si.</p></>}
    {tab === 'pendencias' && <section className="content-card"><div className="section-heading"><h2>Suas pendências</h2><span className="badge">{data.debts.length} registros</span></div>{!data.debts.length && <p className="portal-empty">Nenhuma dívida retornada para este acesso.</p>}{data.debts.map(d => <article className="customer-debt" key={d.id}><div className="debt-row"><div><h3><CreditorIdentity name={d.creditor}/></h3>{d.product&&<p>{d.product}</p>}<p className="contract-number">Contrato {d.contractNumber || d.contractEnding || 'não informado'}</p></div><strong>{money(d.balanceCents)}</strong></div><details className="customer-details"><summary>Ver detalhes de {d.creditor}</summary><dl className="customer-facts"><div><dt>Situação no cadastro</dt><dd>{d.sourceStatus}</dd></div><div><dt>Vencimento informado</dt><dd>{date(d.dueDate)}</dd></div><div><dt>Saldo atual</dt><dd>{money(d.balanceCents)}</dd></div></dl>{d.balanceCents === 0 && <p className="muted">Saldo zero informado. Isso, por si só, não confirma a quitação do contrato.</p>}<a className="text-button" href="https://wa.me/5561995067834">Falar sobre esta pendência ↗</a></details>{d.creditor === 'ARC4U' && <CreditorActions debtId={d.id}/>}</article>)}</section>}
    {tab === 'acordos' && <>{data.debts.filter(d => d.creditor === 'ARC4U').map(d => <section className="content-card" key={d.id}><h2>ARC4U · Contrato {d.contractNumber}</h2><CreditorActions debtId={d.id} agreementsOnly/></section>)}<section className="content-card"><div className="section-heading"><h2>Acompanhe seus acordos</h2><span className="badge">{data.agreements.length} acordos</span></div>{!data.agreements.length && <p className="portal-empty">Nenhum acordo encontrado para este acesso.</p>}{data.agreements.map(a => { const paid = a.installments.filter(p => p.paidAt).length; return <article className="agreement" key={a.id}><div className="section-heading"><h3><CreditorIdentity name={a.creditor}/>{a.product&&<> — {a.product}</>}</h3><span className="badge">Firmado em {date(a.agreedAt)}</span></div><p>Contrato final {a.contractEnding || 'não informado'} · {paid} de {a.totalInstallments} parcelas com pagamento informado</p><progress value={paid} max={Math.max(a.totalInstallments, paid, 1)} aria-label={`Parcelas pagas de ${a.creditor}`}/>{a.installments.length < a.totalInstallments && <p className="muted">A consulta retornou {a.installments.length} de {a.totalInstallments} parcelas. As demais não estão disponíveis neste acesso.</p>}<ol className="installment-list">{a.installments.map(p => <li key={p.number}><div><strong>Parcela {p.number}</strong><p>Vencimento {date(p.dueDate)}</p></div><strong>{money(p.amountCents)}</strong><span className={p.paidAt ? 'badge paid-badge' : 'badge'}>{p.paidAt ? `Pago em ${date(p.paidAt)}` : 'Sem pagamento informado'}</span></li>)}</ol><p className="muted">Para documentos ou orientações de pagamento, fale com nossa equipe.</p></article>; })}</section></>}
  </>;
}
export function CustomerPortal() {
    const [data, setData] = useState<Portfolio | null>(null);
    const [error, setError] = useState('');
    const [tab, setTab] = useState<Tab>('inicio');
    const [attempt, setAttempt] = useState(0);
    const [expired, setExpired] = useState(false);
    const [leaving, setLeaving] = useState(false);
    useEffect(() => { const timeout = setTimeout(() => { setExpired(true); setData(null); setError('Sua sessão expirou. Entre novamente para continuar.'); }, 1800000); return () => clearTimeout(timeout); }, []);
    useEffect(() => { if (expired || leaving)
        return; const controller = new AbortController(); fetch('/api/me', { cache: 'no-store', signal: controller.signal }).then(async (r) => { if (r.status === 401) {
        setData(null);
        window.location.replace('/');
        return;
    } if (!r.ok)
        throw new Error(); const result = await r.json(); if (!controller.signal.aborted)
        setData(result); }).catch(() => { if (!controller.signal.aborted)
        setError('Não foi possível consultar suas informações. Tente novamente.'); }); return () => controller.abort(); }, [attempt, expired, leaving]);
    async function logout() { setLeaving(true); setData(null); try {
        await fetch('/api/me', { method: 'DELETE' });
    }
    finally {
        window.location.replace('/');
    } }
    return <div className="portal-page customer-area"><header className="site-header"><Brand /><div className="customer-profile"><span className="profile"><span className="avatar" aria-hidden="true">{data?.customerName?.charAt(0) || 'C'}</span> Seu portal Leal</span><button className="button secondary" onClick={logout} disabled={leaving}>{leaving ? 'Saindo…' : 'Sair'}</button></div></header><div className="portal-layout"><nav className="portal-nav" aria-label="Navegação do portal">{tabs.map(t => <button key={t.id} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}><span aria-hidden="true">{t.icon}</span>{t.label}</button>)}<div className="nav-help"><strong>Estamos por aqui.</strong><p>Conte com a equipe Leal para ajudar no seu próximo passo.</p><a href="https://wa.me/5561995067834">Falar com a Leal ↗</a></div></nav><main id="conteudo" className="portal-content"><div className="page-heading"><span className="eyebrow">PORTAL DO CLIENTE</span><h1>{tab === 'inicio' ? (data?.customerName ? `Olá, ${data.customerName}.` : 'Olá.') : tabs.find(t => t.id === tab)?.label}</h1><p>{tab === 'inicio' ? 'Veja suas informações e escolha como quer seguir.' : 'Acompanhe as informações disponíveis para seu acesso.'}</p></div>{error && <section className="content-card"><p role="alert">{error}</p>{expired ? <Link className="button secondary" href="/">Entrar novamente</Link> : <button className="button secondary" onClick={() => { setError(''); setData(null); setAttempt(a => a + 1); }}>Tentar novamente</button>}</section>}{!data && !error && !leaving && tab !== 'ajuda' && <section className="content-card" role="status">Consultando suas informações…</section>}{data && !expired && !leaving && <PortfolioContent data={data} tab={tab}/>}{tab === 'ajuda' && <section className="content-card support-card"><h2>Como podemos ajudar?</h2><p>Para falar sobre seu cadastro, acesso ou negociação, entre em contato com a equipe Leal.</p><a className="button primary" href="https://wa.me/5561995067834">Conversar no WhatsApp ↗</a><a href="tel:+556134246800">Ligar para (61) 3424-6800</a><details><summary>Já paguei, mas a parcela ainda aparece aqui.</summary><p>O portal exibe o pagamento informado no cadastro. Fale com nossa equipe para conferir a atualização antes de realizar outro pagamento.</p></details></section>}<p className="portal-footnote">Seus dados estão disponíveis somente durante esta sessão. Ao terminar, clique em Sair.</p></main></div></div>;
}
