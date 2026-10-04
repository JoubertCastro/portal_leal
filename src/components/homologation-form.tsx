'use client';
import { useState, type FormEvent } from 'react';
import type { CustomerDebt, CustomerAgreement } from '@/server/integrations/sic';
const money=(cents:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
const date=(value:string)=>value.split('-').reverse().join('/');
export function HomologationForm(){
  const [pending,setPending]=useState(false);const [error,setError]=useState('');
  const [result,setResult]=useState<{debts:CustomerDebt[];agreements:CustomerAgreement[]}|null>(null);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(pending)return;setPending(true);setError('');setResult(null);
    const fields=new FormData(event.currentTarget);
    try{
      const response=await fetch('/api/homologacao/consulta',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({key:fields.get('key'),code:fields.get('code'),document:fields.get('document')})});
      const body=await response.json();
      if(!response.ok){setError(body.error?.message??'Consulta indisponível.');return;}
      if(body.status!=='ready'){setError('Cadastro sem condição de acesso: '+({not_found:'não localizado',no_contacts:'sem telefone móvel válido',review_required:'revisão de identidade necessária'}[body.status as string]??'revisão necessária'));return;}
      setResult(body);
    }catch{setError('Não foi possível conectar.');}finally{setPending(false);}
  }
  return <><form className="access-form" onSubmit={submit} autoComplete="off">
    <label htmlFor="test-key">Chave exclusiva de homologação</label><input id="test-key" name="key" type="password" required maxLength={128}/>
    <label htmlFor="test-document">CPF autorizado</label><input id="test-document" name="document" inputMode="numeric" required maxLength={18}/>
    <label htmlFor="test-code">Código de teste</label><input id="test-code" name="code" inputMode="numeric" required maxLength={8}/>
    <button className="button primary" disabled={pending}>{pending?'Consultando…':'Consultar integração'}</button>
    {error&&<p role="alert">{error}</p>}
  </form>{result&&<section aria-live="polite"><h2>Cadastro localizado</h2><p>Os dados abaixo foram retornados pela API. Nenhuma sessão de cliente foi criada.</p><h2>Dívidas ({result.debts.length})</h2>{!result.debts.length&&<p>Nenhuma dívida retornada.</p>}{result.debts.map(d=><article key={d.id} style={{padding:20,marginBlock:16,border:'1px solid #ddd',borderRadius:16}}><h3>{d.creditor} — {d.product}</h3><p>Contrato final {d.contractEnding} · {d.sourceStatus}</p><p>Vencimento: {date(d.dueDate)} · Saldo: {money(d.balanceCents)}</p></article>)}<h2>Acordos ({result.agreements.length})</h2>{!result.agreements.length&&<p>Nenhum acordo encontrado.</p>}{result.agreements.map(a=><article key={a.id}><h3>{a.creditor} — {a.product}</h3><p>Acordo de {date(a.agreedAt)} · {a.totalInstallments} parcelas</p>{a.installments.map(p=><p key={p.number}>Parcela {p.number}: {money(p.amountCents)} · Vencimento {date(p.dueDate)} · {p.paidAt?'Pago em '+date(p.paidAt):'Sem pagamento informado'}</p>)}</article>)}<button className="button" onClick={()=>setResult(null)}>Ocultar resultados</button></section>}</>;
}
