'use client';
import { useState, type FormEvent } from 'react';
import { formatCpf, validCpf } from '@/domain/cpf';

export function AccessForm() {
  const [cpf, setCpf] = useState('');
  const [error, setError] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setInvalid(false); setError('');
    if (!validCpf(cpf)) { setInvalid(true); setError('Confira o CPF e informe os 11 dígitos corretamente.'); return; }
    setPending(true);
    try {
      // Readiness check only. No CPF leaves the browser while authentication is unavailable.
      const response = await fetch('/api/auth/challenges', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', cache: 'no-store' });
      setError(response.status === 503 ? 'O acesso está em preparação. Para consultar suas pendências agora, fale com nossa equipe.' : 'Não foi possível iniciar o acesso. Tente novamente mais tarde.');
    } catch { setError('Não foi possível conectar. Verifique sua conexão e tente novamente.'); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit} noValidate className="access-form">
    <label htmlFor="cpf">Seu CPF</label>
    <input id="cpf" name="cpf" value={cpf} onChange={event => { setCpf(formatCpf(event.target.value)); setError(''); setInvalid(false); }} inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" maxLength={14} aria-invalid={invalid} aria-describedby={error ? 'access-hint access-error' : 'access-hint'} required />
    <p id="access-hint" className="field-hint">A confirmação será pelo WhatsApp cadastrado na Leal.</p>
    <button className="button primary" type="submit" disabled={pending}>{pending ? 'Verificando disponibilidade…' : 'Continuar com meu CPF'}<span aria-hidden="true">→</span></button>
    {error && <p id="access-error" className="form-message" role="alert">{error}</p>}
    <p className="privacy-note"><span aria-hidden="true">▣</span> Seus dados serão exibidos somente após confirmar sua identidade.</p>
  </form>;
}
