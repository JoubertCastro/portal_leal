import { test, expect } from '@playwright/test';
const portfolio = { customerName:'Maria de Souza', debts: [{ id: '1', creditor: 'CARREFOUR', product: 'Cartão de crédito', contractNumber:'000012345678901234', contractEnding: '1234', sourceStatus: 'PROMESSA', dueDate: '2026-01-01', balanceCents: 123456 }], agreements: [{ id: '1:2', creditor: 'CARREFOUR', product: 'Cartão', contractEnding: '1234', agreedAt: '2026-01-01', totalInstallments: 3, installments: [{ number: 1, dueDate: '2026-01-10', amountCents: 10000, paidAt: '2026-01-09' }, { number: 2, dueDate: '2026-02-10', amountCents: 15000, paidAt: null }] }] };
test.beforeEach(async ({ context }) => { await context.setExtraHTTPHeaders({ Cookie: '__Host-leal_browser=' + 'a'.repeat(43) + '; __Host-leal_session=' + 'b'.repeat(43) }); });
test('real portal layout uses protected portfolio, tabs, details, installments and logout', async ({ page }, info) => {
    let loggedOut = false;
    await page.route('**/api/me', async (route) => { if (route.request().method() === 'DELETE') {
        loggedOut = true;
        await route.fulfill({ json: { ok: true } });
    }
    else
        await route.fulfill({ json: portfolio }); });
    await page.goto('/portal');
    await expect(page.getByRole('heading', { name: 'Olá, Maria de Souza.' })).toBeVisible();
    await expect(page.getByText('Saldo total consultado')).toBeVisible(); await expect(page.locator('.creditor-logo')).toBeVisible(); await expect.poll(()=>page.locator('.creditor-logo').evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(0);
    await expect(page.getByText('Parcela 2 de 3 · 10/02/2026')).toBeVisible();
    await page.screenshot({ path: `test-results/customer-${info.project.name}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Minhas pendências' }).click();
    await expect(page.getByText('Contrato 000012345678901234',{exact:true})).toBeVisible(); await page.getByText('Ver detalhes de CARREFOUR').click();
    await expect(page.getByText('PROMESSA', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Meus acordos' }).click();
    await expect(page.getByText('Pago em 09/01/2026')).toBeVisible();
    await expect(page.getByText(/retornou 2 de 3 parcelas/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Atendimento', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Conversar no WhatsApp' })).toBeVisible();
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await expect(page).toHaveURL('/');
    expect(loggedOut).toBe(true);
});
test('failed lookup offers retry and empty response never invents records', async ({ page }) => { let requests = 0; await page.route('**/api/me', async (route) => { requests++; await route.fulfill(requests === 1 ? { status: 503, json: {} } : { json: { debts: [], agreements: [] } }); }); await page.goto('/portal'); await expect(page.getByRole('alert').filter({hasText:'Não foi possível consultar'})).toBeVisible(); await page.getByRole('button', { name: 'Tentar novamente' }).click(); await expect(page.getByText(/Nenhuma parcela sem pagamento/)).toBeVisible(); await page.getByRole('button', { name: 'Meus acordos' }).click(); await expect(page.getByText('Nenhum acordo encontrado para este acesso.')).toBeVisible(); });
test('invalid session redirects before showing portfolio', async ({ page }) => { await page.route('**/api/me', route => route.fulfill({ status: 401, json: {} })); await page.goto('/portal'); await expect(page).toHaveURL('/'); await expect(page.getByText('CARREFOUR')).toHaveCount(0); });

test('ARC4 actions are on demand, simulate safely and download the first-payment PDF', async ({ page }, info) => {
  let requests = 0;
  const id = '550e8400-e29b-41d4-a716-446655440000';
  await page.route('**/api/me', route => route.fulfill({ json: { ...portfolio, debts: [{ ...portfolio.debts[0], creditor: 'ARC4U', contractNumber: 'CN-001' }], agreements: [] } }));
  await page.route('**/api/me/creditor', async route => {
    requests++; const input = route.request().postDataJSON();
    expect(input.debtId).toBe('1'); expect(input.document).toBeUndefined(); expect(input.contract).toBeUndefined();
    if (input.action === 'overview') return route.fulfill({ json: { balances: [{ contract: 'CN-001', currentValue: 100 }], agreements: [{ id, status: 'Aguardando Pagamento', installmentsCount: 1, totalValue: 100 }], policies: [{ code: 'TEST', name: 'Condição disponível', paymentDates: ['2026-10-09T00:00:00'], installmentRanges: [{ minInstallments: 1, maxInstallments: 2 }] }] } });
    if (input.action === 'simulate') return route.fulfill({ json: { options: [{ installmentsCount: 1, totalValueWithDiscount: 100, totalDiscountValue: 0, monthlyInterestRate: 0, annualInterestRate: 0, cetRate: 0, installments: [{ index: 1, dueDate: '2026-10-09', installmentValueWithDiscount: 100 }] }] } });
    if (input.action === 'details') return route.fulfill({ json: { id, status: 'Aguardando Pagamento', statusCode: 'VALIDATED', installments: [{ index: 1, dueDate: '2026-10-09', installmentValueWithDiscount: 100, status: 'CREATED' }] } });
    expect(input.action).toBe('first-payment');
    return route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.7\nsynthetic\n%%EOF' });
  });
  await page.goto('/portal'); await expect(page.getByText('Saldo total consultado')).toBeVisible(); expect(requests).toBe(0);
  await page.getByRole('button', { name: 'Minhas pendências' }).click();
  await page.getByRole('button', { name: 'Consultar condições e boletos ARC4U' }).click();
  await page.getByRole('button', { name: 'Simular negociação' }).click();
  await expect(page.getByText('Resultado da simulação')).toBeVisible();
  await expect(page.getByText('Esta simulação não cria um acordo.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Ver parcelas e boletos' }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar boleto de adesão' }).click();
  expect((await downloaded).suggestedFilename()).toBe('boleto-leal.pdf');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/arc4-portal-${info.project.name}.png`, fullPage: true });
});

test('creditor route rejects cross-origin and unauthenticated requests', async ({ request }) => {
  const path = '/api/me/creditor';
  expect((await request.post(path, { data: { action: 'overview', debtId: '1' }, headers: { Origin: 'https://invalid.example' } })).status()).toBe(403);
  expect((await request.post(path, { data: { action: 'overview', debtId: '1' }, headers: { Origin: 'http://127.0.0.1:4174' } })).status()).toBe(401);
});

test('agreement summary requires consent and a completed slide; exposes PDF and WhatsApp after confirmation', async ({ page }, info) => {
  const agreementId = '550e8400-e29b-41d4-a716-446655440000';
  const quoteId = '550e8400-e29b-41d4-a716-446655440001';
  const option = { installmentsCount: 1, totalValueWithDiscount: 100, totalDiscountValue: 20, monthlyInterestRate: 0, annualInterestRate: 0, cetRate: 0, installments: [{ index: 1, dueDate: '2026-10-20', installmentValueWithDiscount: 100 }] };
  let confirmations = 0; let sends = 0;
  await page.route('**/api/me', route => route.fulfill({ json: { ...portfolio, debts: [{ ...portfolio.debts[0], creditor: 'ARC4U', contractNumber: 'CN-TEST' }], agreements: [] } }));
  await page.route('**/api/me/creditor', async route => {
    const input = route.request().postDataJSON();
    if (input.action === 'overview') return route.fulfill({ json: { balances: [{ contract: 'CN-TEST', currentValue: 120 }], agreements: [], policies: [{ code: 'TEST', name: 'Condição disponível', paymentDates: ['2026-10-20'], installmentRanges: [{ minInstallments: 1, maxInstallments: 1 }] }] } });
    if (input.action === 'simulate') return route.fulfill({ json: { options: [option], quoteId, expiresAt: new Date(Date.now() + 900000).toISOString(), noticeVersion: '2026-10-09-v1', contract: 'CN-TEST', creditor: 'ARC4U' } });
    if (input.action === 'confirm') { confirmations++; expect(input.accepted).toBe(true); expect(input.quoteId).toBe(quoteId); expect(input.amount).toBeUndefined(); return route.fulfill({ json: { operation: { quoteId, state: 'created', agreementId } } }); }
    if (input.action === 'details') return route.fulfill({ json: { id: agreementId, status: 'Aguardando pagamento', statusCode: 'VALIDATED', installments: [{ ...option.installments[0], status: 'CREATED' }] } });
    if (input.action === 'send-boleto') { sends++; expect(input.phone).toBeUndefined(); return route.fulfill({ json: { delivery: 'accepted' } }); }
    expect(input.action).toBe('first-payment'); return route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.7\nsynthetic\n%%EOF' });
  });
  await page.goto('/portal'); await page.getByRole('button', { name: 'Minhas pendências' }).click();
  await page.getByRole('button', { name: 'Consultar condições e boletos ARC4U' }).click();
  await page.getByRole('button', { name: 'Simular negociação' }).click();
  await page.getByRole('button', { name: 'Fechar acordo', exact: true }).click();
  const modal = page.getByRole('dialog'); const slider = page.getByRole('slider');
  await expect(modal).toBeVisible(); await expect(slider).toBeDisabled(); expect(confirmations).toBe(0);
  await page.getByRole('checkbox', { name: /Li o resumo/ }).check();
  await expect(slider).toBeEnabled();
  await slider.focus(); await slider.press('ArrowRight'); await slider.press('Enter'); expect(confirmations).toBe(0);
  await expect(modal).toHaveCSS('max-height', /.+/);
  expect(await modal.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: `test-results/agreement-modal-${info.project.name}.png`, fullPage: false });
  await slider.press('Home');
  const handle = (await slider.boundingBox())!; const track = (await page.locator('.agreement-slide').boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down(); await page.mouse.move(handle.x + handle.width / 2 + track.width / 3, handle.y + handle.height / 2, { steps: 5 }); await page.mouse.up();
  expect(confirmations).toBe(0);
  if (info.project.name === 'desktop') {
    const h = (await slider.boundingBox())!;
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await page.mouse.down();
    await page.mouse.move(h.x + h.width / 2 + track.width - 58, h.y + h.height / 2, { steps: 10 }); await page.mouse.up();
  } else { await slider.press('End'); await slider.press('Enter'); }
  await expect(modal).toHaveCount(0); await expect(page.getByText('Acordo registrado', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Abrir boleto em nova aba' })).toBeVisible(); expect(confirmations).toBe(1);
  await page.getByRole('button', { name: 'Enviar boleto no WhatsApp', exact: true }).click();
  await expect(page.getByText(/A Meta aceitou o envio/)).toBeVisible(); expect(sends).toBe(1);
  await expect(page.getByRole('link', { name: 'Falar com nossos especialistas' })).toBeVisible();
});
