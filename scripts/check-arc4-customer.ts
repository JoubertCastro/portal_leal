import { Arc4Client, Arc4Error, arc4Bindings } from '../src/server/integrations/creditors/arc4';
import { LealAuthClient } from '../src/server/integrations/leal';
import { SicGateway } from '../src/server/integrations/sic';
import { IntegrationError } from '../src/server/integrations/http';

// Administrative diagnostic only. No login bypass, OTP, persisted offer or agreement creation.
// Supply only an explicitly authorized test document; never print payloads or persist fixtures.
async function main() {
  let stage = 'configuration';
  try {
    const document = process.env.ARC4_TEST_DOCUMENT;
    if (!document) throw new IntegrationError('configuration');
    const sic = new SicGateway(new LealAuthClient({ authUrl: process.env.LEAL_AUTH_URL ?? '', username: process.env.LEAL_AUTH_USUARIO ?? '', password: process.env.LEAL_AUTH_SENHA ?? '' }), process.env.LEAL_SERVER ?? 'SRVW-MIS-01');
    stage = 'sic_registration';
    const registration = await sic.registration(document);
    if (registration.kind !== 'ready') {
      console.log(JSON.stringify({ stage, result: registration.kind, arc4: 'not_called' })); return;
    }
    const scope = { document: registration.document, identityKey: registration.identityKey, internalIds: [...new Set(registration.contacts.flatMap(contact => contact.internalIds))], acceptedNames: registration.acceptedNames };
    stage = 'sic_debts';
    const bindings = arc4Bindings(await sic.debts(scope));
    if (!bindings.length) { console.log(JSON.stringify({ stage, arc4: 'not_called', reason: 'no_authorized_arc4_contracts' })); return; }
    const client = new Arc4Client({ clientId: process.env.ARC4_CLIENT_ID ?? '', clientSecret: process.env.ARC4_CLIENT_SECRET ?? '' });
    const contracts = bindings.map(binding => binding.providerContract);
    stage = 'arc4_balances';
    const balances = await client.balances(scope.document, contracts);
    stage = 'arc4_agreements';
    const agreements = await client.agreements(scope.document, contracts);
    console.log(JSON.stringify({ result: 'ok', authorizedContracts: contracts.length, balanceCount: balances.length, agreementCount: agreements.length }));
    if (process.env.ARC4_TEST_MODE === 'simulate') {
      if (!balances.length) throw new Arc4Error('invalid_selection');
      const contract = balances[0].contract;
      stage = 'arc4_policies';
      const policies = await client.policies(scope.document, contracts, contract);
      if (!policies.length) throw new Arc4Error('invalid_selection');
      const policy = policies[0];
      stage = 'arc4_simulation';
      const simulation = await client.simulate(scope.document, contracts, { contract, policyCode: policy.code, firstPaymentDate: policy.paymentDates[0], installmentsCount: policy.installmentRanges[0].minInstallments });
      console.log(JSON.stringify({ result: 'ok', stage, options: simulation.options.length, persistenceRequested: false }));
    } else if (process.env.ARC4_TEST_MODE === 'first-payment') {
      stage = 'arc4_first_payment';
      let found = false;
      for (const agreement of agreements) {
        const detail = await client.agreementDetail(scope.document, contracts, agreement.id);
        if (detail.statusCode !== 'VALIDATED' || detail.installments.some(item => item.status === 'PAID')) continue;
        const boleto = await client.firstPayment(scope.document, contracts, agreement.id);
        console.log(JSON.stringify({ result: 'ok', stage, pdfBytes: boleto.pdf.length, pdfValidated: true }));
        found = true; break;
      }
      if (!found) throw new Arc4Error('payment_unavailable');
    }
  } catch (error) {
    console.error(JSON.stringify({ stage, result: 'failed', code: error instanceof IntegrationError || error instanceof Arc4Error ? error.code : 'unavailable' }));
    process.exitCode = 1;
  }
}
void main();
