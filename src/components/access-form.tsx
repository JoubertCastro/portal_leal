'use client';
import { useRef, useState, type FormEvent } from 'react';
import { formatDocument, validDocument, type DocumentKind } from '@/domain/document';
import { UiIcon } from './ui-icon';
import { track } from './tracking-client';
import {WhatsappAccess,type PhoneSelection} from './whatsapp-access';

export function AccessForm() {
  const [cpf, setCpf] = useState('');
  const [kind, setKind] = useState<DocumentKind>('cpf');
  const [error, setError] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [pending, setPending] = useState(false);
  const [legalName,setLegalName]=useState('');
  const [selection,setSelection]=useState<PhoneSelection|null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const tracked = useRef({ started:false, completed:false });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setInvalid(false); setError('');
    if (!validDocument(cpf, kind)) { track('document_invalid',{documentKind:kind});setInvalid(true); setError(kind === 'cpf' ? 'Confira o CPF e informe os 11 dígitos corretamente.' : 'Confira o CNPJ e informe os 14 caracteres corretamente.'); inputRef.current?.focus(); return; }
    track('access_submitted',{documentKind:kind});
    setPending(true);
    try {
      // No document leaves the browser until the server enables the complete flow.
      const response = await fetch('/api/auth/challenges', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', cache: 'no-store' });
      if(response.ok){
        const lookup=await fetch('/api/auth/challenges',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({action:'prepare',document:cpf,...(kind==='cnpj'?{legalName}: {})})});
        const data=await lookup.json();
        if(lookup.ok&&data.kind==='select_phone'){setSelection(data);setCpf('');setLegalName('');return;}
        setError(lookup.ok?'Não foi possível liberar o acesso automático. Fale com nossa equipe.':data.error?.message??'Não foi possível iniciar o acesso.');return;
      }
      if(!response.ok)track('access_unavailable',{documentKind:kind});
      setError(response.status === 503 ? 'O acesso está em preparação. Para consultar suas pendências agora, fale com nossa equipe.' : 'Não foi possível iniciar o acesso. Tente novamente mais tarde.');
    } catch { track('access_unavailable',{documentKind:kind});setError('Não foi possível conectar. Verifique sua conexão e tente novamente.'); }
    finally { setPending(false); }
  }
  if(selection)return <WhatsappAccess selection={selection} onRestart={()=>{setSelection(null);setError('');setCpf('');}}/>;
  return <form onSubmit={submit} noValidate className="access-form">
    <div className="document-kind"><label htmlFor="document-kind">Tipo de documento</label><select id="document-kind" value={kind} onChange={event => { setKind(event.target.value as DocumentKind); setCpf(''); setError(''); setInvalid(false);tracked.current={started:false,completed:false}; }}><option value="cpf">CPF</option><option value="cnpj">CNPJ</option></select></div>
    <label htmlFor="cpf">Seu {kind.toUpperCase()}</label>
    <input ref={inputRef} id="cpf" name="document" value={cpf} onChange={event => { const value=formatDocument(event.target.value, kind);setCpf(value); setError(''); setInvalid(false);if(value&&!tracked.current.started)tracked.current.started=track('document_started',{documentKind:kind});if(validDocument(value,kind)&&!tracked.current.completed)tracked.current.completed=track('document_completed',{documentKind:kind}); }} inputMode={kind === 'cpf' ? 'numeric' : 'text'} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder={kind === 'cpf' ? '000.000.000-00' : '00.000.000/0000-00'} maxLength={kind === 'cpf' ? 14 : 18} aria-invalid={invalid} aria-describedby={error ? 'access-hint access-error' : 'access-hint'} required />
    {kind==='cnpj'&&<><label htmlFor="legal-name">Razão social</label><input id="legal-name" value={legalName} onChange={e=>setLegalName(e.target.value)} autoComplete="organization" maxLength={250}/></>}
    <p id="access-hint" className="field-hint"><UiIcon name="message" />Confirmação pelo WhatsApp cadastrado na Leal.</p>
    <button className="button primary" type="submit" disabled={pending}>{pending ? 'Verificando disponibilidade…' : `Continuar com meu ${kind.toUpperCase()}`}<UiIcon name="arrow" /></button>
    {error && <p id="access-error" className="form-message" role="alert">{error}</p>}
    <p className="privacy-note"><UiIcon name="shield" /> Seus dados serão exibidos somente após confirmar sua identidade.</p>
  </form>;
}
