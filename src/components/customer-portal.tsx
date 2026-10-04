'use client';
import {useEffect,useState} from 'react';
import type {CustomerDebt,CustomerAgreement} from '@/server/integrations/sic';
const money=(n:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100);
const date=(s:string)=>s.split('-').reverse().join('/');
export function CustomerPortal(){
  const [data,setData]=useState<{debts:CustomerDebt[];agreements:CustomerAgreement[]}|null>(null);const [error,setError]=useState('');
  useEffect(()=>{const controller=new AbortController();fetch('/api/me',{cache:'no-store',signal:controller.signal}).then(async r=>{if(r.status===401){window.location.replace('/');return;}if(!r.ok)throw new Error();setData(await r.json());}).catch(()=>{if(!controller.signal.aborted)setError('Não foi possível consultar suas informações. Tente novamente mais tarde.');});
    const timeout=setTimeout(()=>{setData(null);setError('Sua sessão expirou. Entre novamente para continuar.');},1800000);return()=>{controller.abort();clearTimeout(timeout);};},[]);
  async function logout(){setData(null);try{await fetch('/api/me',{method:'DELETE'});}finally{window.location.replace('/');}}
  return <main id="conteudo" className="customer-portal"><header><h1>Seu portal Leal</h1><button className="button" onClick={logout}>Sair</button></header>{error&&<p role="alert">{error}</p>}{!data&&!error&&<p role="status">Consultando suas informações…</p>}{data&&<><h2>Suas dívidas</h2>{!data.debts.length&&<p>Nenhuma dívida retornada para este acesso.</p>}{data.debts.map(d=><article key={d.id}><h3>{d.creditor}</h3><p>{d.product} · Contrato final {d.contractEnding}</p><p>{d.sourceStatus} · Vencimento {date(d.dueDate)}</p><strong>{money(d.balanceCents)}</strong></article>)}<h2>Seus acordos</h2>{!data.agreements.length&&<p>Nenhum acordo encontrado.</p>}{data.agreements.map(a=><article key={a.id}><h3>{a.creditor} — {a.product}</h3><p>Acordo de {date(a.agreedAt)} · {a.totalInstallments} parcelas</p>{a.installments.map(p=><p key={p.number}>Parcela {p.number}: {money(p.amountCents)} · Vencimento {date(p.dueDate)} · {p.paidAt?'Pago em '+date(p.paidAt):'Sem pagamento informado'}</p>)}</article>)}</>}</main>;
}
