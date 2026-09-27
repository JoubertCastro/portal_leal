import { test, expect } from '@playwright/test';

test('access validates CPF, sends no personal data, and reports unavailable auth', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Acesse seu portal.' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar com meu CPF' }).click();
  await expect(page.locator('#access-error')).toContainText('Confira o CPF');
  await page.getByLabel('Seu CPF', { exact: true }).fill('52998224725');
  const request = page.waitForRequest('**/api/auth/challenges');
  await page.getByRole('button', { name: 'Continuar com meu CPF' }).click();
  expect((await request).postData()).toBe('{}');
  await expect(page.locator('#access-error')).toContainText('acesso está em preparação');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/access-${test.info().project.name}.png`, fullPage: true });
});
test('demo navigation, details and agreements work without authentication', async ({ page }) => {
  await page.goto('/demonstracao');
  await expect(page.getByText('Todos os valores e registros', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Minhas pendências', exact: true }).click();
  await page.getByRole('button', { name: 'Ver detalhes' }).first().click();
  await expect(page.getByRole('status')).toContainText('Nenhum acordo ou pagamento');
  await page.getByRole('button', { name: 'Meus acordos', exact: true }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '2');
  await page.getByRole('button', { name: 'Atendimento', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Como podemos ajudar?' })).toBeVisible();
  await page.getByRole('button', { name: 'Visão geral', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/portal-${test.info().project.name}.png`, fullPage: true });
});
test('private routes fail closed, origin enforced and no false event acknowledgement', async ({ request, page }) => {
  const me = await request.get('/api/me'); expect(me.status()).toBe(401); expect(me.headers()['cache-control']).toBe('no-store');
  expect((await request.post('/api/auth/challenges', { headers: { Origin: 'https://evil.example' } })).status()).toBe(403);
  expect((await request.post('/api/auth/verify', { headers: { Origin: 'http://127.0.0.1:4174' }, data: { code: '123456' } })).status()).toBe(503);
  expect((await request.post('/api/events', { headers: { Origin: 'http://127.0.0.1:4174' } })).status()).toBe(503);
  await page.context().addCookies([{ name: 'session', value: 'forged', domain: '127.0.0.1', path: '/' }]);
  await page.goto('/portal'); await expect(page).toHaveURL('http://127.0.0.1:4174/');
  expect((await request.get('/.env')).status()).toBe(404);
  expect((await request.get('/legacy/app.js')).status()).toBe(404);
});
