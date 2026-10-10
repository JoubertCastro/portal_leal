export const AGREEMENT_NOTICE_VERSION = '2026-10-09-v1';
export const AGREEMENT_NOTICE = 'Li o resumo e concordo em fechar este acordo. Comprometo-me a pagar os valores apresentados nas respectivas datas de vencimento.';
export interface AgreementOption {
  installmentsCount: number; totalValueWithDiscount: number; totalDiscountValue: number;
  monthlyInterestRate: number; annualInterestRate: number; cetRate: number;
  installments: { index: number; dueDate: string; installmentValueWithDiscount: number }[];
}
export interface AgreementSelection { contract: string; policyCode: string; firstPaymentDate: string; installmentsCount: number }
export interface AgreementQuote { selection: AgreementSelection; options: AgreementOption[]; creditor: string; product: string; debtId: string }
export type AgreementState = 'prepared' | 'processing' | 'unknown' | 'changed' | 'failed' | 'created';
export interface AgreementOperation { quoteId: string; state: AgreementState; agreementId?: string }
