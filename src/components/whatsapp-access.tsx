'use client';
import {useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
export interface PhoneSelection {selectionId:string;noticeVersion:string;options:{id:string;label:string}[]}
export function WhatsappAccess({selection,onRestart}:{selection:PhoneSelection;onRestart:()=>void}){
  const router=useRouter();
  const [optionId,setOption]=useState('');const [authentication,setAuthentication]=useState(false);const [communications,setCommunications]=useState(false);
  const [challenge,setChallenge]=useState('');const [code,setCode]=useState('');const [pending,setPending]=useState(false);const [error,setError]=useState('');
  async function submit(event:FormEvent){event.preventDefault();if(pending)return;setPending(true);setError('');
    try{const response=await fetch(challenge?'/api/auth/verify':'/api/auth/challenges',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify(challenge?{challengeId:challenge,code}:{action:'send',selectionId:selection.selectionId,optionId,authentication,communications,noticeVersion:selection.noticeVersion})});
      const data=await response.json();if(!response.ok){setError(data.error?.message??'Não foi possível concluir.');return;}
      if(challenge){router.push('/portal');router.refresh();return;}setChallenge(data.challengeId);
    }catch{setError('Falha de conexão. Se você recebeu um código sem confirmação nesta página, reinicie o acesso após um minuto.');}finally{setPending(false);}}
  return <form className="access-form" onSubmit={submit}>{!challenge?<>
    <label htmlFor="whatsapp-option">Em qual WhatsApp deseja receber o código?</label><select id="whatsapp-option" value={optionId} onChange={e=>setOption(e.target.value)} required><option value="">Selecione um telefone</option>{selection.options.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select>
    <label className="auth-consent"><input type="checkbox" checked={authentication} onChange={e=>setAuthentication(e.target.checked)} required/> Quero receber um código de acesso no WhatsApp selecionado para confirmar minha identidade.</label>
    <label className="auth-consent"><input type="checkbox" checked={communications} onChange={e=>setCommunications(e.target.checked)}/> Quero receber também mensagens e comunicados da Leal pelo WhatsApp. Esta escolha é opcional e pode ser cancelada.</label>
  </>:<><label htmlFor="whatsapp-code">Código recebido no WhatsApp</label><input id="whatsapp-code" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required/><p>O código vale por cinco minutos. Confira o WhatsApp selecionado.</p></>}
    <button className="button primary" disabled={pending}>{pending?'Aguarde…':challenge?'Confirmar e acessar':'Receber código no WhatsApp'}</button>
    {error&&<p className="form-message" role="alert">{error}</p>}
    <button className="button" type="button" disabled={pending} onClick={onRestart}>Reiniciar acesso</button>
  </form>;
}
