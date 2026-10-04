import { validCpf } from './cpf';

export type DocumentKind = 'cpf' | 'cnpj';
export function normalizeDocument(value: string): string { return value.trim().toUpperCase().replace(/[.\-/\s]/g, ''); }
export function validDocument(value: string, kind?: DocumentKind): boolean {
  if (typeof value !== 'string' || value.length > 32 || !/^(?:\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2}|[A-Z0-9]{12}\d{2}|[A-Z0-9]{2}\.[A-Z0-9]{3}\.[A-Z0-9]{3}\/[A-Z0-9]{4}-\d{2})$/i.test(value.trim())) return false;
  const document = normalizeDocument(value);
  if (document.length === 11) return kind !== 'cnpj' && validCpf(document);
  if (kind === 'cpf' || !/^[A-Z0-9]{12}\d{2}$/.test(document) || /^(.)\1+$/.test(document)) return false;
  // Receita Federal: character ASCII minus 48; same weights for numeric/alpha CNPJ.
  for (let length = 12; length <= 13; length++) {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += (document.charCodeAt(i) - 48) * ((length - 1 - i) % 8 + 2);
    const remainder = sum % 11;
    if (Number(document[length]) !== (remainder < 2 ? 0 : 11 - remainder)) return false;
  }
  return true;
}
export function formatDocument(value: string, kind: DocumentKind): string {
  const clean = value.toUpperCase().replace(kind === 'cpf' ? /\D/g : /[^A-Z0-9]/g, '').slice(0, kind === 'cpf' ? 11 : 14);
  return kind === 'cpf'
    ? clean.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
    : clean.replace(/^(.{2})(.)/, '$1.$2').replace(/^(.{6})(.)/, '$1.$2').replace(/^(.{10})(.)/, '$1/$2').replace(/^(.{15})(.)/, '$1-$2');
}
