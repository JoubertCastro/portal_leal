import { LealAuthClient } from '../src/server/integrations/leal';
import { SicGateway } from '../src/server/integrations/sic';
import { IntegrationError } from '../src/server/integrations/http';

// Operator-only diagnostic. Never expose this command as a public HTTP endpoint.
// Input comes from environment; output deliberately omits documents, names,
// destinations, tokens, balances and upstream response bodies.
async function main() {
  const client = new LealAuthClient({
    authUrl: process.env.LEAL_AUTH_URL ?? '',
    username: process.env.LEAL_AUTH_USUARIO ?? '',
    password: process.env.LEAL_AUTH_SENHA ?? '',
  });
  await client.getToken();
  console.log('SIC authentication: OK');
  const document = process.env.SIC_TEST_DOCUMENT;
  if (!document) { console.log('Customer endpoints: skipped (SIC_TEST_DOCUMENT required)'); return; }
  const sic = new SicGateway(client, process.env.LEAL_SERVER ?? 'SRVW-MIS-01');
  const registration = await sic.registration(document, process.env.SIC_TEST_LEGAL_NAME);
  console.log('Registration validation:', registration.kind);
  if (registration.kind !== 'ready') {
    console.log('Financial queries: skipped (identity/contact validation did not pass)');
    return;
  }
  const scope = { document: registration.document, identityKey: registration.identityKey,
    internalIds: [...new Set(registration.contacts.flatMap(contact => contact.internalIds))],
    acceptedNames: registration.acceptedNames };
  // Administrative connectivity check, not a customer session or login bypass.
  await sic.debts(scope);
  console.log('Debt response validation: OK');
  await sic.agreements(scope);
  console.log('Agreement response validation: OK');
}

void main().catch(error => {
  console.error('SIC check failed:', error instanceof IntegrationError ? error.message : 'configuration_or_validation');
  process.exitCode = 1;
});
