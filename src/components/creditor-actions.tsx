'use client';
import { useEffect, useRef, useState } from 'react';
import { AgreementConfirmation } from './agreement-confirmation';
import { AGREEMENT_NOTICE_VERSION, type AgreementOperation } from '../domain/agreement';

interface Policy { code: string; name: string; paymentDates: string[]; installmentRanges: { minInstallments: number; maxInstallments: number }[] }
interface Overview { balances: { contract: string; currentValue: number }[]; agreements: { id: string; status: string; installmentsCount: number; totalValue: number }[]; policies: Policy[]; operation?: AgreementOperation | null }
interface Detail { id: string; status: string; statusCode: string; installments: { index: number; dueDate: string; installmentValueWithDiscount: number; status: string | null }[] }
interface Simulation { quoteId?: string; expiresAt?: string; noticeVersion?: string; contract?: string; creditor?: string; options: { installmentsCount: number; totalValueWithDiscount: number; totalDiscountValue: number; monthlyInterestRate: number; annualInterestRate: number; cetRate: number; installments: { index: number; dueDate: string; installmentValueWithDiscount: number }[] }[] }
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
  const [confirmIndex, setConfirmIndex] = useState<number | null>(null);
  const [operation, setOperation] = useState<AgreementOperation | null>(null);
  const [pdfUrl, setPdfUrl] = useState('');
  const [delivery, setDelivery] = useState('');
  const controller = useRef<AbortController | null>(null);
  const urls = useRef(new Set<string>());
  function clearPdf() { if (pdfUrl) { URL.revokeObjectURL(pdfUrl); urls.current.delete(pdfUrl); setPdfUrl(''); } }
  useEffect(() => { const currentUrls = urls.current; return () => { controller.current?.abort(); currentUrls.forEach(url => URL.revokeObjectURL(url)); }; }, []);
  async function request(action: string, params: Record<string, unknown> = {}, download: boolean | 'view' = false, keepError = false): Promise<unknown> {
    controller.current?.abort(); const pending = new AbortController(); controller.current = pending;
    setBusy(true); if (!keepError) setError('');
    if (download === 'view') clearPdf();
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
        if (download === 'view') { if (pdfUrl) { URL.revokeObjectURL(pdfUrl); urls.current.delete(pdfUrl); } setPdfUrl(url); return; }
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
    setDetail(null); setSimulation(null); clearPdf(); setDelivery('');
    const result = await request('overview') as Overview | undefined;
    if (result) { setOverview(result); setOperation(result.operation ?? null); selectPolicy(0, result.policies); }
  }
  async function loadAgreement(agreementId: string) {
    setDetail(null); setDelivery(''); clearPdf();
    const result = await request('details', { agreementId }) as Detail | undefined;
    if (result) setDetail(result);
    return result;
  }
  async function confirm() {
    if (!simulation?.quoteId || confirmIndex === null) return;
    const quoteId = simulation.quoteId;
    const result = await request('confirm', { quoteId, optionIndex: confirmIndex, accepted: true, noticeVersion: simulation.noticeVersion ?? AGREEMENT_NOTICE_VERSION }) as { operation: AgreementOperation } | undefined;
    setConfirmIndex(null);
    if (result) { setOperation(result.operation); if (result.operation.agreementId) {
      const created = await loadAgreement(result.operation.agreementId);
      if (created?.statusCode === 'VALIDATED' && !created.installments.some(i => i.status === 'PAID')) await request('first-payment', { agreementId: result.operation.agreementId }, 'view');
    } }
    else {
      const state = await request('operation', {}, false, true) as { operation: AgreementOperation | null } | undefined;
      setOperation(state ? state.operation : { quoteId, state: 'unknown' });
      setSimulation(null);
    }
  }
  async function sendBoleto(agreementId: string, index?: number) {
    const result = await request('send-boleto', { agreementId, ...(index === undefined ? {} : { index }) }) as { delivery: string } | undefined;
    if (result) setDelivery(result.delivery);
  }
  const policy = overview?.policies[policyIndex];
  const counts = policy ? Array.from({ length: 999 }, (_, index) => index + 1).filter(value => policy.installmentRanges.some(range => value >= range.minInstallments && value <= range.maxInstallments)) : [];
  return <section className="creditor-actions" aria-label="Serviços ARC4U" aria-busy={busy}>
    <button className="button secondary" disabled={busy} onClick={load}>{busy ? 'Consultando…' : overview ? 'Atualizar consulta ARC4U' : agreementsOnly ? 'Consultar acordos e boletos ARC4U' : 'Consultar condições e boletos ARC4U'}</button>
    {error && <p role="alert">{error}</p>}
    {operation && <div className="agreement-operation" role="status"><h4>{operation.state === 'created' ? 'Acordo registrado' : 'Acompanhamento da confirmação'}</h4><p>{operation.state === 'created' ? 'Seu acordo foi registrado no credor. Confira abaixo a situação e a disponibilidade do boleto.' : 'Sua confirmação está em acompanhamento. Não confirme outro acordo para este contrato. Se o resultado continuar pendente, fale com nossos especialistas.'}</p>{operation.agreementId ? <button className="button secondary" disabled={busy} onClick={() => void loadAgreement(operation.agreementId!)}>Consultar boleto do acordo</button> : <button className="button secondary" disabled={busy} onClick={async () => { const result = await request('operation') as { operation: AgreementOperation | null } | undefined; if (result?.operation) setOperation(result.operation); }}>Atualizar acompanhamento</button>}</div>}
    {overview && <div className="creditor-result">
      {!agreementsOnly && <>
        {!overview.balances.length && <p>Nenhuma dívida disponível para nova negociação nesta consulta ao credor. Confira os acordos abaixo.</p>}
        {policy && !operation && <form className="creditor-form" onSubmit={async event => { event.preventDefault(); setSimulation(null); const result = await request('simulate', { policyCode: policy.code, firstPaymentDate: paymentDate, installmentsCount: count }) as Simulation | undefined; if (result) setSimulation(result); }}>
          <h4>Simule suas condições</h4>
          <label>Condição<select value={policyIndex} disabled={busy} onChange={e => selectPolicy(Number(e.target.value))}>{overview.policies.map((p, index) => <option key={p.code} value={index}>{p.name}</option>)}</select></label>
          <label>Primeiro vencimento<select value={paymentDate} disabled={busy} onChange={e => { setPaymentDate(e.target.value); setSimulation(null); }}>{policy.paymentDates.map(value => <option key={value} value={value}>{date(value)}</option>)}</select></label>
          <label>Quantidade de parcelas<select value={count} disabled={busy} onChange={e => { setCount(Number(e.target.value)); setSimulation(null); }}>{counts.map(value => <option key={value} value={value}>{value === 1 ? 'À vista' : `${value} parcelas`}</option>)}</select></label>
          <button className="button primary" disabled={busy} type="submit">Simular negociação</button>
        </form>}
        {!!overview.balances.length && !policy && <p>Não há condições de negociação disponíveis no momento. Fale com nossa equipe.</p>}
        {simulation && !operation && <div className="agreement-simulation"><h4>Resultado da simulação</h4>{simulation.options.map((option, i) => <div key={i}><p><strong>Total: {money(option.totalValueWithDiscount)}</strong> · Desconto: {money(option.totalDiscountValue)}</p><p>Juros: {option.monthlyInterestRate}% ao mês · {option.annualInterestRate}% ao ano · CET informado: {option.cetRate}%</p><ul>{option.installments.map(item => <li key={item.index}>Parcela {item.index} · {date(item.dueDate)} · {money(item.installmentValueWithDiscount)}</li>)}</ul><button className="button primary" disabled={busy || !simulation.quoteId} onClick={() => setConfirmIndex(i)}>Fechar acordo</button></div>)}<p>Esta simulação não cria um acordo. Revise o resumo e confirme para contratar.</p>{!simulation.quoteId && <p>A contratação pelo portal está sendo preparada. Nossos especialistas podem ajudar a concluir.</p>}</div>}
        {confirmIndex !== null && simulation?.quoteId && simulation.expiresAt && <AgreementConfirmation option={simulation.options[confirmIndex]} contract={simulation.contract ?? ''} creditor={simulation.creditor ?? 'ARC4U'} expiresAt={simulation.expiresAt} busy={busy} onCancel={() => setConfirmIndex(null)} onConfirm={() => void confirm()} />}
      </>}
      <h4>Acordos consultados na ARC4U</h4>
      {!overview.agreements.length && <p>Nenhum acordo encontrado para este contrato.</p>}
      {overview.agreements.map(a => <div className="creditor-agreement" key={a.id}><p><strong>{a.status}</strong> · {a.installmentsCount} parcelas · {money(a.totalValue)}</p><button className="button secondary" disabled={busy} onClick={() => void loadAgreement(a.id)}>Ver parcelas e boletos</button></div>)}
      {detail && <div className="creditor-detail"><h4>{detail.status}</h4>
        {detail.statusCode === 'VALIDATED' && !detail.installments.some(item => item.status === 'PAID') && <button className="button primary" disabled={busy} onClick={() => void request('first-payment', { agreementId: detail.id }, true)}>Baixar boleto de adesão</button>}
        {detail.statusCode === 'VALIDATED' && !detail.installments.some(item => item.status === 'PAID') && <div className="agreement-document-actions"><button className="button secondary" disabled={busy} onClick={() => void request('first-payment', { agreementId: detail.id }, 'view')}>Visualizar boleto</button><button className="button secondary" disabled={busy} onClick={() => void sendBoleto(detail.id)}>Enviar boleto no WhatsApp</button></div>}
        <ul>{detail.installments.map(item => <li key={item.index}><p>Parcela {item.index} · {date(item.dueDate)} · <strong>{money(item.installmentValueWithDiscount)}</strong> · {item.status === 'PAID' ? 'Paga' : 'Pagamento não confirmado nesta consulta'}</p>{['ACTIVE', 'OVERDUE'].includes(detail.statusCode) && item.status !== 'PAID' && <button className="button secondary" disabled={busy} onClick={() => void request('installment-payment', { agreementId: detail.id, index: item.index }, true)}>Baixar boleto da parcela {item.index}</button>}{['ACTIVE', 'OVERDUE'].includes(detail.statusCode) && item.status !== 'PAID' && <div className="agreement-document-actions"><button className="button secondary" disabled={busy} onClick={() => void request('installment-payment', { agreementId: detail.id, index: item.index }, 'view')}>Visualizar parcela {item.index}</button><button className="button secondary" disabled={busy} onClick={() => void sendBoleto(detail.id, item.index)}>Enviar parcela {item.index} no WhatsApp</button></div>}</li>)}</ul>
        <p>Ao solicitar o envio, você receberá este boleto no WhatsApp confirmado neste acesso.</p>
        {delivery && <p role="status">{delivery === 'accepted' ? 'A Meta aceitou o envio do boleto. A entrega no WhatsApp ainda depende do processamento da plataforma.' : 'O envio está em acompanhamento. Não enviamos novamente para evitar duplicidade. Você pode baixar o PDF por aqui.'}</p>}
        <p>Confira beneficiário, valor e vencimento antes de pagar. Se já pagou, fale com nossa equipe antes de realizar outro pagamento.</p>
      </div>}
    </div>}
    {pdfUrl && <div className="agreement-pdf"><a className="button secondary" href={pdfUrl} target="_blank" rel="noopener noreferrer">Abrir boleto em nova aba ↗</a><button className="text-button" onClick={() => { URL.revokeObjectURL(pdfUrl); urls.current.delete(pdfUrl); setPdfUrl(''); }}>Fechar visualização</button><iframe title="Visualização do boleto" src={pdfUrl} /></div>}
    <a className="button secondary specialist-button" href="https://wa.me/5561995067834" target="_blank" rel="noopener noreferrer">Falar com nossos especialistas ↗</a>
  </section>;
}
