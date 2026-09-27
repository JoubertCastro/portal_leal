import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('access page has no detected WCAG A/AA violations and FAQ works by keyboard', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('heading', { name: 'Acesse seu portal.' }).waitFor();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations).toEqual([]);
  const summary = page.locator('summary').first();
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('details').first()).toHaveAttribute('open', '');
  await page.getByRole('link', { name: 'Acessar portal', exact: true }).click();
  await expect(page.getByLabel('Seu CPF', { exact: true })).toBeInViewport();
});

test('narrow layout keeps access usable without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Continuar com meu CPF' })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Continuar com meu CPF' }).click();
  await expect(page.getByLabel('Seu CPF', { exact: true })).toBeFocused();
});
