import 'server-only';
import { z } from 'zod';
import { normalizeDocument, validDocument } from '../../domain/document';
import { normalizeName } from '../../domain/name-match';

const text = z.string().max(250).transform(value => value.trim()).refine(value => value.length > 0 && !/[\u0000-\u001f\u007f<>]/.test(value));
const identifier = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const document = z.string().max(32).refine(value => validDocument(value)).transform(normalizeDocument);
export const identityKey = normalizeName;
const currency = z.number().finite().nonnegative().max(1_000_000_000).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.00001).transform(value => Math.round(value * 100));
const localDate = z.string().max(32).regex(/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,7})?)?$/).refine(value => {
  const date = value.slice(0, 10); const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
}).transform(value => value.slice(0, 10));
const base = { Codigo_Interno: identifier, CPF_CNPJ: document };
export const registrationsSchema = z.array(z.object({ ...base, Descricao: text, Nome: text, telefone: z.string().max(40) })).max(500);
export const debtsSchema = z.array(z.object({ ...base, cartao: z.string().max(250).transform(value => value.trim()).refine(value => /^[A-Za-z0-9 _-]+$/.test(value)), Descricao: text, nome: text, Banco: text, Produto: text, Vencimento: localDate, Saldo_Atual: currency })).max(500);
export const agreementsSchema = z.array(z.object({ ...base, cartao: z.string().max(250).transform(value => value.trim()).refine(value => /^[A-Za-z0-9 _-]+$/.test(value)), nome: text, Banco: text, Produto: text, data_do_acordo: localDate, parcelas: z.number().int().min(1).max(999), codigo_do_acordo: identifier, parcela: z.number().int().min(0).max(999), vencimento: localDate, valor_da_parcela: currency, pagamento: localDate.nullable() }).refine(row => row.parcela <= row.parcelas)).max(2000);

export function normalizeWhatsapp(raw: string): string | null {
  if (!/^[\d+()\s-]*$/.test(raw)) return null;
  let phone = raw.replace(/\D/g, '');
  if (phone.length === 13 && phone.startsWith('55')) phone = phone.slice(2);
  // Only Brazilian mobile numbers. Blank/landline/malformed values are not OTP destinations.
  if (!/^[1-9]\d9\d{8}$/.test(phone) || /^(\d)\1{7}$/.test(phone.slice(3))) return null;
  const ddds = new Set('11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split(' '));
  if (!ddds.has(phone.slice(0, 2))) return null;
  return `+55${phone}`;
}
export function maskWhatsapp(phone: string): string { return `+55 (••) •••••-${phone.slice(-4)}`; }
