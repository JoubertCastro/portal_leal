export const AGREEMENT_NOTICE_VERSION = '2026-10-09-v1';
export const AGREEMENT_NOTICE = 'Li o resumo e concordo em fechar este acordo. Comprometo-me a pagar os valores apresentados nas respectivas datas de vencimento.';
export interface AgreementOption {
  installmentsCount: number; totalValueWithDiscount: number; totalDiscountValue: number;
  monthlyInterestRate: number; annualInterestRate: number; cetRate: number;
  installments: { index: number; dueDate: string; installmentValueWithDiscount: number }[];
}
export interface AgreementSelection { contract: string; policyCode: string; firstPaymentDate: string; installmentsCount: number }
/** Compare payable cents, without changing the creditor's schedule or amounts. */
export function hasAllowedInstallmentShape(option: AgreementOption): boolean {
  if (!option.installments.length || option.installments.length !== option.installmentsCount) return false;
  const ordered = [...option.installments].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.index - b.index);
  const cents = ordered.map(item => Math.round(item.installmentValueWithDiscount * 100));
  if (cents.some(value => !Number.isSafeInteger(value) || value <= 0)) return false;
  if (cents.length === 1) return true;
  return cents[0] >= cents[1] && cents.slice(1).every(value => value === cents[1]);
}
export interface AgreementQuote { selection: AgreementSelection; options: AgreementOption[]; creditor: string; product: string; debtId: string }
export type AgreementState = 'prepared' | 'processing' | 'unknown' | 'changed' | 'failed' | 'created' | 'cancelled';
export interface AgreementOperation { quoteId: string; state: AgreementState; agreementId?: string }
