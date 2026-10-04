'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { flushTracking, startTracking, stopTracking, track } from './tracking-client';
export function AnalyticsPreferences(){
  const pathname=usePathname();
  const [available,setAvailable]=useState(false);const [open,setOpen]=useState(false);const [pending,setPending]=useState(false);const [error,setError]=useState('');
  useEffect(()=>{
    let cancelled=false;
    void fetch('/api/analytics/consent',{cache:'no-store'}).then(response=>response.json()).then(async status=>{
      if(cancelled||!status.available)return;
      let blocked=false;try{blocked=localStorage.getItem('leal_analytics_block')==='1';}catch{}
      setAvailable(true);setOpen(!status.decided||(blocked&&status.granted));
      if(status.granted&&pathname==='/')await startTracking();
    }).catch(()=>{});
    const visibility=()=>{track(document.visibilityState==='hidden'?'page_hidden':'page_resumed');if(document.visibilityState==='hidden')void flushTracking();};
    const click=(event:MouseEvent)=>{const link=(event.target as Element).closest?.('a');if(!link)return;const href=link.getAttribute('href')??'';if(href==='/demonstracao')track('demo_opened');else if(href.startsWith('https://wa.me/')||href.startsWith('tel:')||href.startsWith('mailto:'))track('help_clicked');};
    document.addEventListener('visibilitychange',visibility);document.addEventListener('click',click);
    return()=>{cancelled=true;stopTracking();document.removeEventListener('visibilitychange',visibility);document.removeEventListener('click',click);};
  },[pathname]);
  async function choose(granted:boolean){
    if(pending)return;setPending(true);setError('');
    // Stop immediately on withdrawal even if the preference service is unavailable.
    stopTracking();
    if(!granted)try{localStorage.setItem('leal_analytics_block','1');}catch{}
    try{const response=await fetch('/api/analytics/consent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({granted}),cache:'no-store'});
      if(!response.ok)throw new Error();setOpen(false);if(granted){try{localStorage.removeItem('leal_analytics_block');}catch{}await startTracking();}
    }catch{setError('Não foi possível salvar sua escolha. A coleta está pausada neste momento. Tente novamente.');}
    finally{setPending(false);}
  }
  if(!available)return null;
  return <aside className="analytics-preferences" aria-label="Preferências de estatísticas">
    {open?<div className="analytics-panel"><strong>Você escolhe como melhorar este portal</strong><p>Com sua permissão, usamos cookies próprios para entender as etapas de acesso, a origem das campanhas, a região aproximada e os resultados das consultas. Não gravamos o que você digita. Recusar não impede seu atendimento.</p><p><a href="/privacidade-estatisticas">Como usamos essas informações</a></p><div className="analytics-actions"><button type="button" disabled={pending} onClick={()=>void choose(false)}>Recusar estatísticas</button><button type="button" disabled={pending} onClick={()=>void choose(true)}>Permitir estatísticas</button></div>{error&&<p role="alert">{error}</p>}</div>:<button type="button" onClick={()=>setOpen(true)}>Preferências de estatísticas</button>}
  </aside>;
}
