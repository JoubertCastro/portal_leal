import 'server-only';
import { z } from 'zod';
import { IntegrationError } from '../http';

export const amount = z.number().finite().nonnegative().max(1e12);
export const apiDate = z.string().max(64).regex(/^\d{4}-\d{2}-\d{2}(?:T[0-9:.]+(?:Z|[+-]\d{2}:\d{2})?)?$/).refine(value => {
  const day = value.slice(0, 10); const parsed = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === day;
});
export const policiesSchema = z.array(z.object({
  code: z.string().min(1).max(150), name: z.string().min(1).max(250),
  minimumEntryAmount: amount, minimumInstalmentAmount: amount,
  paymentDates: z.array(apiDate).min(1).max(366),
  installmentRanges: z.array(z.object({
    minInstallments: z.number().int().min(1).max(999),
    maxInstallments: z.number().int().min(1).max(999),
  }).refine(range => range.minInstallments <= range.maxInstallments)).min(1).max(100),
})).max(100);
export type Arc4Policy = z.infer<typeof policiesSchema>[number];
export const simulationSchema = z.object({
  document: z.string().trim(),
  offer: z.object({
    contracts: z.array(z.string().min(1).max(150)).min(1).max(100),
    installmentOptions: z.array(z.object({
      installmentsCount: z.number().int().min(1).max(999),
      totalValueWithDiscount: amount, totalDiscountValue: amount,
      monthlyInterestRate: amount, annualInterestRate: amount, cetRate: amount,
      installments: z.array(z.object({
        index: z.number().int().min(0).max(999), dueDate: apiDate,
        installmentValueWithDiscount: amount,
      })).min(1).max(999),
    })).min(1).max(100),
  }),
});
export const installmentSchema = z.object({
  index: z.number().int().min(0).max(999), dueDate: apiDate,
  // Future installments can omit status; null means unknown, never proof of non-payment.
  installmentValueWithDiscount: amount, status: z.string().max(100).nullish().transform(value => value ?? null),
});
const MAX_PDF_BYTES = 512 * 1024;
const MAX_BASE64_LENGTH = 4 * Math.ceil(MAX_PDF_BYTES / 3);
export const firstPaymentSchema = z.object({
  idAgreement: z.uuid(), buffer: z.string().min(8).max(MAX_BASE64_LENGTH),
  barCode: z.string().regex(/^\d{44}$/), digitableLine: z.string().regex(/^\d{47,48}$/),
});
export const installmentPaymentSchema = z.object({
  agreementId: z.uuid(), installment: z.number().int().min(0).max(999), dueDate: apiDate,
  base64Representation: z.string().min(8).max(MAX_BASE64_LENGTH),
  barCode: z.string().regex(/^\d{44}$/), digitableLine: z.string().regex(/^\d{47,48}$/),
});
export function decodeBoleto(encoded: string): Buffer {
  if (!encoded.length || encoded.length > MAX_BASE64_LENGTH || encoded.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(encoded)) throw new IntegrationError('invalid_response');
  const pdf = Buffer.from(encoded, 'base64');
  if (pdf.length > MAX_PDF_BYTES || pdf.subarray(0, 5).toString('ascii') !== '%PDF-' || pdf.toString('base64') !== encoded) throw new IntegrationError('invalid_response');
  return pdf;
}
