import 'server-only';
import type { CustomerDebt, RecordScope } from '../sic';
import { IntegrationError } from '../http';

export interface CreditorBalance {
  contract: string;
  product: string;
  // Preserve provider precision. Round for presentation only, never for creating an offer.
  currentValue: number;
}
export interface CreditorProvider {
  readonly key: string;
  readonly sicCreditors: readonly string[];
  balances(document: string, contracts: readonly string[]): Promise<CreditorBalance[]>;
}
export interface CreditorBinding {
  sicInternalId: string;
  sicCreditor: string;
  sicContract: string;
  providerKey: string;
  providerContract: string;
}

/** Server-only bindings must come from an approved mapping, never a browser payload.
 * Input debts must come from SicGateway.debts for the verified session scope.
 * Presentation aliases (e.g. the BTG logo) are deliberately not routing rules.
 */
export class CreditorRegistry {
  private readonly providers = new Map<string, CreditorProvider>();
  constructor(providers: readonly CreditorProvider[], private readonly bindings: readonly CreditorBinding[]) {
    for (const provider of providers) {
      if (!provider.key || this.providers.has(provider.key)) throw new IntegrationError('configuration');
      this.providers.set(provider.key, provider);
    }
    const ids = new Set<string>();
    for (const binding of bindings) {
      if (!/^\d+$/.test(binding.sicInternalId) || !binding.sicCreditor || !binding.sicContract || !binding.providerContract || !this.providers.has(binding.providerKey) || ids.has(binding.sicInternalId)) throw new IntegrationError('configuration');
      if (!this.providers.get(binding.providerKey)!.sicCreditors.includes(binding.sicCreditor)) throw new IntegrationError('configuration');
      ids.add(binding.sicInternalId);
    }
  }
  async balances(scope: RecordScope, authorizedDebts: readonly CustomerDebt[], debtId: string): Promise<CreditorBalance[] | null> {
    if (!scope.internalIds.some(id => String(id) === debtId)) throw new IntegrationError('unauthorized');
    const debts = authorizedDebts.filter(debt => debt.id === debtId);
    if (debts.length !== 1) throw new IntegrationError('unauthorized');
    const binding = this.bindings.find(item => item.sicInternalId === debtId);
    if (!binding) return null; // Unsupported creditor: zero external requests, including OAuth.
    const debt = debts[0];
    if (binding.sicCreditor !== debt.creditor || binding.sicContract !== debt.contractNumber) throw new IntegrationError('unauthorized');
    return this.providers.get(binding.providerKey)!.balances(scope.document, [binding.providerContract]);
  }
}
