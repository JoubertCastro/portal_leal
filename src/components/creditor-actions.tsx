'use client';
import { useEffect, useRef, useState } from 'react';

interface Policy { code: string; name: string; paymentDates: string[]; installmentRanges: { minInstallments: number; maxInstallments: number }[] }
interface Overview { balances: { contract: string; currentValue: number }[]; agreements: { id: string; status: string; installmentsCount: number; totalValue: number }[]; policies: Policy[] }
interface Detail { id: string; status: string; statusCode: string; installments: { index: number; dueDate: string; installmentValueWithDiscount: number; status: string | null }[] }
interface Simulation { options: { installmentsCount: number; totalValueWithDiscount: number; totalDiscountValue: number; monthlyInterestRate: number; annualInterestRate: number; cetRate: number; installments: { index: number; dueDate: string; installmentValueWithDiscount: number }[] }[] }
const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = (value: string) => value.slice(0, 10).split('-').reverse().join('/');

export function CreditorActions({ debtId, agreementsOnly = false }: { debtId: string; agreementsOnly?: boolean }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [policyIndex, setPolicyIndex] = useState(0);
  const [paymentDate, setPaymentDate] = useState('');
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const urls = useRef(new Set<string>());
  useEffect(() => { const currentUrls = urls.current; return () => { controller.current?.abort(); currentUrls.forEach(url => URL.revokeObjectURL(url)); }; }, []);
  async function request(action: string, params: Record<string, unknown> = {}, download = false): Promise<unknown> {
    controller.current?.abort(); const pending = new AbortController(); controller.current = pending;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/me/creditor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', signal: pending.signal, body: JSON.stringify({ action, debtId, ...params }) });
      if (response.status === 401) { window.location.replace('/'); return; }
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message || 'Não foi possível consultar o credor. Tente novamente.');
      }
      if (download) {
        if (!response.headers.get('content-type')?.startsWith('application/pdf')) throw new Error('Não foi possível obter o boleto.');
        const blob = await response.blob(); if (pending.signal.aborted) return;
        const url = URL.createObjectURL(blob); urls.current.add(url);
        const link = document.createElement('a'); link.href = url; link.download = 'boleto-leal.pdf'; document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => { URL.revokeObjectURL(url); urls.current.delete(url); }, 1000);
        return;
      }
      const value = await response.json(); if (!pending.signal.aborted) return value;
    } catch (e) { if (!pending.signal.aborted) setError(e instanceof Error ? e.message : 'Tente novamente.'); }
    finally { if (!pending.signal.aborted) setBusy(false); }
  }
  function selectPolicy(index: number, policies = overview?.policies ?? []) {
    setPolicyIndex(index); setPaymentDate(policies[index]?.paymentDates[0] ?? ''); setCount(policies[index]?.installmentRanges[0]?.minInstallments ?? 1); setSimulation(null);
  }
  async function load() {
    setDetail(null); setSimulation(null);
    const result = await request('overview') as Overview | undefined;
    if (result) { setOverview(result); selectPolicy(0, result.policies); }
  }
  const policy = overview?.policies[policyIndex];
  const counts = policy ? Array.from({ length: 999 }, (_, index) => index + 1).filter(value => policy.installmentRanges.some(range => value >= range.minInstallments && value <= range.maxInstallments)) : [];
  return <section className="creditor-actions" aria-label="Serviços ARC4U" aria-busy={busy}>
    <button className="button secondary" disabled={busy} onClick={load}>{busy ? 'Consultando…' : overview ? 'Atualizar consulta ARC4U' : agreementsOnly ? 'Consultar acordos e boletos ARC4U' : 'Consultar condições e boletos ARC4U'}</button>
    {error && <p role="alert">{error}</p>}
    {overview && <div className="creditor-result">
      {!agreementsOnly && <>
        {!overview.balances.length && <p>Nenhuma dívida disponível para nova negociação nesta consulta ao credor. Confira os acordos abaixo.</p>}
        {policy && <form className="creditor-form" onSubmit={async event => { event.preventDefault(); setSimulation(null); const result = await request('simulate', { policyCode: policy.code, firstPaymentDate: paymentDate, installmentsCount: count }) as Simulation | undefined; if (result) setSimulation(result); }}>
          <h4>Simule suas condições</h4>
          <label>Condição<select value={policyIndex} disabled={busy} onChange={e => selectPolicy(Number(e.target.value))}>{overview.policies.map((p, index) => <option key={p.code} value={index}>{p.name}</option>)}</select></label>
          <label>Primeiro vencimento<select value={paymentDate} disabled={busy} onChange={e => { setPaymentDate(e.target.value); setSimulation(null); }}>{policy.paymentDates.map(value => <option key={value} value={value}>{date(value)}</option>)}</select></label>
          <label>Quantidade de parcelas<select value={count} disabled={busy} onChange={e => { setCount(Number(e.target.value)); setSimulation(null); }}>{counts.map(value => <option key={value} value={value}>{value === 1 ? 'À vista' : `${value} parcelas`}</option>)}</select></label>
          <button className="button primary" disabled={busy} type="submit">Simular negociação</button>
        </form>}
        {!!overview.balances.length && !policy && <p>Não há condições de negociação disponíveis no momento. Fale com nossa equipe.</p>}
        {simulation && <div role="status"><h4>Resultado da simulação</h4>{simulation.options.map((option, i) => <div key={i}><p><strong>Total: {money(option.totalValueWithDiscount)}</strong> · Desconto: {money(option.totalDiscountValue)}</p><p>Juros: {option.monthlyInterestRate}% ao mês · {option.annualInterestRate}% ao ano · CET informado: {option.cetRate}%</p><ul>{option.installments.map(item => <li key={item.index}>Parcela {item.index} · {date(item.dueDate)} · {money(item.installmentValueWithDiscount)}</li>)}</ul></div>)}<p>Esta simulação não cria um acordo. As condições serão confirmadas na contratação.</p><a className="text-button" href="https://wa.me/5561995067834">Concluir com a equipe Leal ↗</a></div>}
      </>}
      <h4>Acordos consultados na ARC4U</h4>
      {!overview.agreements.length && <p>Nenhum acordo encontrado para este contrato.</p>}
      {overview.agreements.map(a => <div className="creditor-agreement" key={a.id}><p><strong>{a.status}</strong> · {a.installmentsCount} parcelas · {money(a.totalValue)}</p><button className="button secondary" disabled={busy} onClick={async () => { setDetail(null); const result = await request('details', { agreementId: a.id }) as Detail | undefined; if (result) setDetail(result); }}>Ver parcelas e boletos</button></div>)}
      {detail && <div className="creditor-detail"><h4>{detail.status}</h4>
        {detail.statusCode === 'VALIDATED' && !detail.installments.some(item => item.status === 'PAID') && <button className="button primary" disabled={busy} onClick={() => void request('first-payment', { agreementId: detail.id }, true)}>Baixar boleto de adesão</button>}
        <ul>{detail.installments.map(item => <li key={item.index}><p>Parcela {item.index} · {date(item.dueDate)} · <strong>{money(item.installmentValueWithDiscount)}</strong> · {item.status === 'PAID' ? 'Paga' : 'Pagamento não confirmado nesta consulta'}</p>{['ACTIVE', 'OVERDUE'].includes(detail.statusCode) && item.status !== 'PAID' && <button className="button secondary" disabled={busy} onClick={() => void request('installment-payment', { agreementId: detail.id, index: item.index }, true)}>Baixar boleto da parcela {item.index}</button>}</li>)}</ul>
        <p>Confira beneficiário, valor e vencimento antes de pagar. Se já pagou, fale com nossa equipe antes de realizar outro pagamento.</p>
      </div>}
    </div>}
  </section>;
}
