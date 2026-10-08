import test from 'node:test';
import assert from 'node:assert/strict';
import { Arc4Client, ARC4_TOKEN_URL } from '../src/server/integrations/creditors/arc4';
import { decodeBoleto } from '../src/server/integrations/creditors/arc4-schemas';

const document = '52998224725';
const id = '550e8400-e29b-41d4-a716-446655440000';
const otherId = '550e8400-e29b-41d4-a716-446655440001';
const contract = 'CN-000123-A';
const date = '2026-10-09T00:00:00';
const credentials = { clientId: 'test', clientSecret: 'fake' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const token = () => json({ access_token: 'test', token_type: 'Bearer', expires_in: 3600 });
const policy = { code: 'TEST', name: 'Teste', minimumEntryAmount: 25, minimumInstalmentAmount: 10, paymentDates: [date], installmentRanges: [{ minInstallments: 1, maxInstallments: 3 }] };
const input = { contract, policyCode: policy.code, firstPaymentDate: date, installmentsCount: 1 };
const installment = { index: 1, dueDate: date, installmentValueWithDiscount: 100, status: 'CREATED' };
const agreement = { idAgreement: id, document, contracts: [contract], status: 'Aguardando Pagamento', installmentsAmount: 1, totalValueWithDiscount: 100 };
const detail = { ...agreement, statusCode: 'VALIDATED', installments: [installment] };
const pdf = Buffer.from('%PDF-1.7\nsynthetic test fixture\n%%EOF');
const boleto = { idAgreement: id, buffer: pdf.toString('base64'), barCode: '1'.repeat(44), digitableLine: '1'.repeat(47) };
const simulation = { document, offer: { contracts: [contract], installmentOptions: [{ installmentsCount: 1, totalValueWithDiscount: 100, totalDiscountValue: 0, monthlyInterestRate: 0, annualInterestRate: 0, cetRate: 0, installments: [installment] }] } };

test('simulation revalidates balances/policy and forces non-persistence with zero entry for one installment', async () => {
  let posts = 0;
  const client = new Arc4Client(credentials, async (url, init) => {
    if (url === ARC4_TOKEN_URL) return token();
    const path = new URL(String(url)).pathname;
    if (path.endsWith('/balance')) return json({ document, totalContracts: 1, customerBalance: { products: [{ contract, name: 'Produto', balance: { curveValue: 100 } }] } });
    if (path.endsWith('/policies')) return json([policy]);
    assert.ok(path.endsWith('/offers')); posts++;
    assert.equal(init?.method, 'POST');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.simulated, true); assert.equal(body.installmentEntry, 0);
    for (const flag of ['overlimitDiscountRequest', 'ignoreExistingForSimulation', 'ignoreInputValueValidationForSimulation', 'skipBillingValidation']) assert.equal(body[flag], false);
    assert.deepEqual(body.contracts, [contract]);
    return json(simulation);
  });
  const result = await client.simulate(document, [contract], input);
  assert.equal(result.options.length, 1); assert.equal(posts, 1);
  await assert.rejects(client.simulate(document, [contract], { ...input, firstPaymentDate: '2026-12-31' }), /invalid_selection/);
  await assert.rejects(client.simulate(document, [contract], { ...input, installmentsCount: 4 }), /invalid_selection/);
  assert.equal(posts, 1);
});

test('simulation never retries an ambiguous POST and rejects another contract in the response', async () => {
  for (const response of ['outage', 'wrong_contract']) {
    let posts = 0;
    const client = new Arc4Client(credentials, async url => {
      if (url === ARC4_TOKEN_URL) return token();
      const path = new URL(String(url)).pathname;
      if (path.endsWith('/balance')) return json({ document, totalContracts: 1, customerBalance: { products: [{ contract, name: 'Produto', balance: { curveValue: 100 } }] } });
      if (path.endsWith('/policies')) return json([policy]);
      posts++;
      if (response === 'outage') throw new Error('private details');
      return json({ ...simulation, offer: { ...simulation.offer, contracts: ['OTHER'] } });
    });
    await assert.rejects(client.simulate(document, [contract], input), response === 'outage' ? /unavailable/ : /invalid_response/);
    assert.equal(posts, 1);
  }
});

test('policies and simulations reject a contract outside scope before any network request', async () => {
  const client = new Arc4Client(credentials, async () => { assert.fail('network must not be called'); });
  await assert.rejects(client.policies(document, ['OTHER'], contract), /unauthorized/);
  await assert.rejects(client.simulate(document, ['OTHER'], input), /unauthorized/);
});

function paymentClient(overrides: { detail?: unknown; boleto?: unknown; items?: unknown[]; billingStatus?: number } = {}) {
  let billingCalls = 0;
  const client = new Arc4Client(credentials, async url => {
    if (url === ARC4_TOKEN_URL) return token();
    const path = new URL(String(url)).pathname;
    if (path.endsWith('/agreements')) {
      const items = overrides.items ?? [agreement];
      return json({ pageNumber: 1, totalItems: items.length, items });
    }
    if (path.endsWith(`/agreements/${id}`)) return json(overrides.detail ?? detail);
    assert.ok(path.endsWith('/first-payment') || path.endsWith('/bankslip'));
    billingCalls++; return json(overrides.boleto ?? boleto, overrides.billingStatus ?? 200);
  });
  return { client, calls: () => billingCalls };
}

test('first payment requires scoped agreement ownership and validates returned PDF and agreement', async () => {
  const valid = paymentClient();
  assert.deepEqual((await valid.client.firstPayment(document, [contract], id)).pdf, pdf);
  assert.equal(valid.calls(), 1);
  const unknown = paymentClient({ items: [] });
  await assert.rejects(unknown.client.firstPayment(document, [contract], id), /unauthorized/);
  assert.equal(unknown.calls(), 0);
  const mixed = paymentClient({ detail: { ...detail, contracts: [contract, 'OTHER'] } });
  await assert.rejects(mixed.client.firstPayment(document, [contract], id), /invalid_response/);
  assert.equal(mixed.calls(), 0);
  const wrong = paymentClient({ boleto: { ...boleto, idAgreement: otherId } });
  await assert.rejects(wrong.client.firstPayment(document, [contract], id), /invalid_response/);
});

test('paid, finalized and approval-pending agreements never request a first-payment boleto', async () => {
  for (const modified of [
    { ...detail, statusCode: 'FINALIZED' },
    { ...detail, statusCode: 'WAITING_OVERLIMIT_APPROVAL' },
    { ...detail, installments: [{ ...installment, status: 'PAID' }] },
  ]) {
    const fixture = paymentClient({ detail: modified });
    await assert.rejects(fixture.client.firstPayment(document, [contract], id), /payment_unavailable/);
    assert.equal(fixture.calls(), 0);
  }
  const pending = paymentClient({ billingStatus: 409 });
  await assert.rejects(pending.client.firstPayment(document, [contract], id), /pending/);
  assert.equal(pending.calls(), 1);
});

test('subsequent boleto requires active agreement, unpaid exact index and matching response', async () => {
  const active = { ...detail, statusCode: 'ACTIVE', installments: [{ ...installment, index: 2, status: null }] };
  const subsequent = { agreementId: id, installment: 2, dueDate: date, base64Representation: boleto.buffer, barCode: boleto.barCode, digitableLine: boleto.digitableLine };
  const valid = paymentClient({ detail: active, boleto: subsequent });
  assert.deepEqual((await valid.client.installmentPayment(document, [contract], id, 2)).pdf, pdf);
  await assert.rejects(valid.client.installmentPayment(document, [contract], id, 0), /payment_unavailable/);
  assert.equal(valid.calls(), 1);
  const paid = paymentClient({ detail: { ...active, installments: [{ ...installment, index: 2, status: 'PAID' }] } });
  await assert.rejects(paid.client.installmentPayment(document, [contract], id, 2), /payment_unavailable/);
  assert.equal(paid.calls(), 0);
  const wrong = paymentClient({ detail: active, boleto: { ...subsequent, installment: 1 } });
  await assert.rejects(wrong.client.installmentPayment(document, [contract], id, 2), /invalid_response/);
});

test('boleto rejects malformed base64, excessive size and non-PDF content', () => {
  for (const encoded of ['not base64', Buffer.from('<html>not a PDF</html>').toString('base64'), Buffer.alloc(512 * 1024 + 1).toString('base64')]) {
    assert.throws(() => decodeBoleto(encoded), /invalid_response/);
  }
});

test('future installments may omit status without being labeled paid or unpaid', async () => {
  const fixture = paymentClient({ detail: { ...detail, installmentsAmount: 2, installments: [installment, { index: 2, dueDate: date, installmentValueWithDiscount: 100 }] } });
  const result = await fixture.client.agreementDetail(document, [contract], id);
  assert.equal(result.installments[1].status, null);
});
