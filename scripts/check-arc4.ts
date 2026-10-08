import { Arc4Client, Arc4Error } from '../src/server/integrations/creditors/arc4';
import { IntegrationError } from '../src/server/integrations/http';

// OAuth only: no documents, offers, agreements or boleto issuance.
async function main() {
  try {
    const client = new Arc4Client({ clientId: process.env.ARC4_CLIENT_ID ?? '', clientSecret: process.env.ARC4_CLIENT_SECRET ?? '' });
    await client.authenticate();
    console.log(JSON.stringify({ integration: client.key, authentication: 'ok', customerEndpoints: 'not_tested' }));
  } catch (error) {
    console.error(JSON.stringify({ authentication: 'failed', code: error instanceof IntegrationError || error instanceof Arc4Error ? error.code : 'unavailable' }));
    process.exitCode = 1;
  }
}
void main();
