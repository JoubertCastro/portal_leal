'use client';
import { useEffect, useRef, useState } from 'react';
import { AGREEMENT_NOTICE, type AgreementOption } from '../domain/agreement';
const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = (s: string) => s.slice(0, 10).split('-').reverse().join('/');

export function AgreementConfirmation({ option, contract, creditor, expiresAt, busy, onCancel, onConfirm }: {
  option: AgreementOption; contract: string; creditor: string; expiresAt: string; busy: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null); const track = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ start: number; width: number } | null>(null); const submitted = useRef(false);
  const [accepted, setAccepted] = useState(false); const [progress, setProgress] = useState(0); const [expired, setExpired] = useState(false);
  useEffect(() => { dialog.current?.showModal(); const timer = setInterval(() => setExpired(Date.now() >= Date.parse(expiresAt)), 1000); return () => clearInterval(timer); }, [expiresAt]);
  const locked = busy || expired || !accepted;
  function confirm() { if (locked || submitted.current) return; submitted.current = true; onConfirm(); }
  return <dialog ref={dialog} className="agreement-modal" aria-labelledby="agreement-title" aria-describedby="agreement-notice" onCancel={e => { e.preventDefault(); if (!busy) onCancel(); }}>
    <div className="agreement-modal-heading"><span className="eyebrow">ÚLTIMA ETAPA</span><button type="button" className="text-button" disabled={busy} onClick={onCancel} aria-label="Fechar resumo do acordo">✕</button></div>
    <h2 id="agreement-title">Vamos confirmar seu acordo?</h2><p>Confira os valores e as datas antes de continuar.</p>
    <div className="agreement-summary"><p>{creditor} · Contrato {contract}</p><span>Total do acordo</span><strong>{money(option.totalValueWithDiscount)}</strong><p>{option.installmentsCount === 1 ? 'Pagamento à vista' : `${option.installmentsCount} parcelas`} por boleto · Desconto de {money(option.totalDiscountValue)}</p></div>
    <ol className="agreement-schedule">{option.installments.map(item => <li key={item.index}><span>Parcela {item.index} · {date(item.dueDate)}</span><strong>{money(item.installmentValueWithDiscount)}</strong></li>)}</ol>
    <p className="agreement-rates">Juros de {option.monthlyInterestRate}% ao mês · {option.annualInterestRate}% ao ano · CET informado pelo credor: {option.cetRate}%.</p>
    <label className="agreement-accept"><input type="checkbox" checked={accepted} disabled={busy || expired} onChange={e => { setAccepted(e.target.checked); setProgress(0); }} /><span id="agreement-notice">{AGREEMENT_NOTICE}</span></label>
    <p className="agreement-hint">A confirmação formaliza um acordo real. O boleto será disponibilizado quando o credor concluir o processamento.</p>
    {expired ? <p role="alert">Esta simulação expirou. Feche este resumo e simule novamente.</p> : <>
      <div ref={track} className={`agreement-slide ${locked ? 'is-locked' : ''}`}>
        <span aria-hidden="true">{busy ? 'Confirmando seu acordo…' : 'Arraste para fechar o acordo →'}</span>
        <div className="agreement-slide-fill" style={{ width: `${progress}%` }} />
        <button type="button" className="agreement-slide-handle" role="slider" aria-label="Confirmar acordo: arraste para a direita" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-valuetext={progress === 100 ? 'Pronto para confirmar. Pressione Enter.' : `${progress} por cento`} aria-describedby="slide-help" disabled={locked} style={{ left: `calc(${progress}% - ${progress * .58}px)` }}
          onPointerDown={e => { if (locked || !track.current) return; gesture.current = { start: e.clientX, width: Math.max(1, track.current.clientWidth - 58) }; e.currentTarget.setPointerCapture(e.pointerId); setProgress(0); }}
          onPointerMove={e => { if (!gesture.current || locked) return; setProgress(Math.round(Math.max(0, Math.min(100, (e.clientX - gesture.current.start) / gesture.current.width * 100)))); }}
          onPointerUp={e => { const g = gesture.current; gesture.current = null; if (g && (e.clientX - g.start) / g.width >= .95) confirm(); else setProgress(0); }}
          onPointerCancel={() => { gesture.current = null; setProgress(0); }}
          onKeyDown={e => { if (locked) return; if (['ArrowRight', 'ArrowLeft', 'Home', 'End', 'Enter'].includes(e.key)) e.preventDefault(); if (e.key === 'ArrowRight') setProgress(Math.min(100, progress + 20)); if (e.key === 'ArrowLeft') setProgress(Math.max(0, progress - 20)); if (e.key === 'Home') setProgress(0); if (e.key === 'End') setProgress(100); if (e.key === 'Enter' && progress === 100) confirm(); }}>→</button>
      </div><p id="slide-help" className="agreement-hint">No teclado, use a seta para a direita até o final e pressione Enter.</p>
    </>}
    <button type="button" className="text-button" disabled={busy} onClick={onCancel}>Voltar à simulação</button>
  </dialog>;
}
