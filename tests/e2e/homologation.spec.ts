import { test, expect } from '@playwright/test';
test('restricted test form keeps fixed code behind exclusive access key',async({page,request})=>{
  await page.goto('/homologacao');
  await expect(page.getByRole('heading',{name:'Teste da integração Leal'})).toBeVisible();
  await page.getByLabel('Chave exclusiva de homologação').fill('invalid');
  await page.getByLabel('CPF autorizado').fill('52998224725');
  await page.getByLabel('Código de teste').fill('1234');
  await page.getByRole('button',{name:'Consultar integração'}).click();
  await expect(page.getByRole('alert').filter({hasText:'Acesso de teste inválido'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const foreign=await request.post('/api/homologacao/consulta',{headers:{origin:'https://example.com'},data:{key:'invalid',code:'1234',document:'52998224725'}});
  expect(foreign.status()).toBe(403);
});
