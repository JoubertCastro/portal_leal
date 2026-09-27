'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Brand } from './brand';
import { demoAgreements, demoDebts } from '@/demo/fixtures';

const money = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
const tabs = [{ id: 'inicio', label: 'Visão geral', icon: '◫' }, { id: 'pendencias', label: 'Minhas pendências', icon: '≡' }, { id: 'acordos', label: 'Meus acordos', icon: '✓' }, { id: 'ajuda', label: 'Atendimento', icon: '?' }] as const;
type Tab = typeof tabs[number]['id'];

export function DemoPortal() {
  const [tab, setTab] = useState<Tab>('inicio');
  const [selected, setSelected] = useState<string | null>(null);
  const debt = demoDebts.find(item => item.id === selected);
  return <div className="portal-page">
    <div className="demo-banner">Demonstração · Todos os valores e registros abaixo são fictícios.<Link href="/">Voltar ao acesso →</Link></div>
    <header className="site-header"><Brand /><span className="profile"><span className="avatar" aria-hidden="true">C</span> Cliente demonstração</span></header>
    <div className="portal-layout"><nav className="portal-nav" aria-label="Navegação da demonstração">{tabs.map(item => <button key={item.id} aria-current={tab === item.id ? 'page' : undefined} onClick={() => { setTab(item.id); setSelected(null); }}><span aria-hidden="true">{item.icon}</span>{item.label}</button>)}<div className="nav-help"><strong>Estamos por aqui.</strong><p>Conte com a equipe Leal para ajudar no seu próximo passo.</p><a href="https://wa.me/5561995067834">Falar com a Leal ↗</a></div></nav>
    <main id="conteudo" className="portal-content">
      <div className="page-heading"><span className="eyebrow">PORTAL DO CLIENTE</span><h1>{tab === 'inicio' ? 'Olá, cliente.' : tabs.find(item => item.id === tab)?.label}</h1><p>{tab === 'inicio' ? 'Veja um resumo e escolha como quer seguir.' : 'Explore como será sua experiência no portal.'}</p></div>
      {tab === 'inicio' && <><div className="summary-grid"><article className="summary-card"><span>Pendências em aberto</span><strong>{money(demoDebts.reduce((sum, item) => sum + item.amountCents, 0))}</strong><small>2 registros de exemplo</small></article><article className="summary-card"><span>Acordos em andamento</span><strong>01</strong><small>Acompanhe suas parcelas</small></article><article className="summary-card accent"><span>Um passo de cada vez</span><h2>Vamos olhar suas opções?</h2><button onClick={() => setTab('pendencias')}>Ver minhas pendências →</button></article></div><section className="content-card"><div className="section-heading"><h2>Seu próximo pagamento</h2><span className="badge">Exemplo</span></div><div className="payment-row"><div><strong>Credor Exemplo C</strong><p>Parcela 3 de 6 · 15/10/2026</p></div><strong className="payment-value">{money(15000)}</strong><button className="button secondary" onClick={() => setTab('acordos')}>Ver acordo</button></div></section></>}
      {tab === 'pendencias' && <section className="content-card"><div className="section-heading"><h2>Suas pendências</h2><span className="badge">{demoDebts.length} registros fictícios</span></div>{demoDebts.map(item => <article key={item.id} className="debt-row"><div><strong>{item.creditor}</strong><p>Disponível para consulta</p></div><strong>{money(item.amountCents)}</strong><button className="button secondary" onClick={() => setSelected(item.id)}>Ver detalhes</button></article>)}{debt && <div className="detail-panel" role="status"><h3>{debt.creditor}</h3><p>Valor ilustrativo: {money(debt.amountCents)}. As condições reais serão apresentadas após a integração com a Leal.</p><p>Nenhum acordo ou pagamento pode ser realizado nesta demonstração.</p><button className="text-button" onClick={() => setSelected(null)}>Fechar detalhes</button></div>}</section>}
      {tab === 'acordos' && <section className="content-card"><h2>Acompanhe seus acordos</h2>{demoAgreements.map(item => <article key={item.id} className="agreement"><div className="section-heading"><h3>{item.creditor}</h3><span className="badge">Em andamento · exemplo</span></div><p>{item.paidInstallments} de {item.installments} parcelas pagas</p><progress value={item.paidInstallments} max={item.installments} aria-label="Parcelas pagas" /><div className="payment-row"><div><strong>Próxima parcela: {money(item.installmentCents)}</strong><p>Vencimento ilustrativo: 15/10/2026</p></div></div><p className="muted">Documentos e formas de pagamento estarão disponíveis após a integração.</p></article>)}</section>}
      {tab === 'ajuda' && <section className="content-card support-card"><h2>Como podemos ajudar?</h2><p>Para falar sobre seu cadastro, acesso ou negociação, entre em contato com a equipe Leal.</p><a className="button primary" href="https://wa.me/5561995067834">Conversar no WhatsApp ↗</a><a href="tel:+556134246800">Ligar para (61) 3424-6800</a><details><summary>Não tenho acesso ao número cadastrado.</summary><p>Fale com a equipe para receber orientação sobre a atualização do cadastro e a confirmação de identidade.</p></details></section>}
      <p className="portal-footnote">Ambiente demonstrativo. Não representa sua situação financeira.</p>
    </main></div>
  </div>;
}
