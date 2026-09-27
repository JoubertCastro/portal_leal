import type { Agreement, Debt } from '@/domain/contracts';
// Fictional data only. Never used by a production data provider.
export const demoDebts: Debt[] = [
  { id: 'demo-debt-1', creditor: 'Credor Exemplo A', amountCents: 125000, status: 'open' },
  { id: 'demo-debt-2', creditor: 'Credor Exemplo B', amountCents: 48000, status: 'open' },
];
export const demoAgreements: Agreement[] = [
  { id: 'demo-agreement-1', creditor: 'Credor Exemplo C', installmentCents: 15000, installments: 6, paidInstallments: 2, nextDueDate: '2026-10-15' },
];
