import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
async function mockAnalytics(page:Page){
  let granted=false;const batches:{events:{name:string}[]}[]=[];let starts=0;
  await page.route('**/api/analytics/consent',async route=>{
    if(route.request().method()==='POST'){granted=route.request().postDataJSON().granted;await route.fulfill({json:{granted}});}
    else await route.fulfill({json:{available:true,granted,decided:false}});
  });
  await page.route('**/api/analytics/journey',async route=>{starts++;await route.fulfill({json:{ready:true}});});
  await page.route('**/api/events',async route=>{const body=route.request().postDataJSON();batches.push(body);await route.fulfill({json:{accepted:body.events.length}});});
  return {batches,starts:()=>starts};
}
test('analytics requires choice, records stages without CPF and can be withdrawn',async({page})=>{
  const f=await mockAnalytics(page);await page.goto('/');
  await expect(page.getByRole('button',{name:'Permitir estatísticas'})).toBeVisible();
  await page.getByLabel('Seu CPF',{exact:true}).fill('52998224725');
  expect(f.starts()).toBe(0);expect(f.batches).toHaveLength(0);
  await page.getByRole('button',{name:'Permitir estatísticas'}).click();
  await expect.poll(()=>f.batches.flatMap(batch=>batch.events).some(event=>event.name==='portal_viewed')).toBe(true);
  await page.getByLabel('Seu CPF',{exact:true}).fill('');await page.getByLabel('Seu CPF',{exact:true}).fill('52998224725');
  await page.getByRole('button',{name:'Continuar com meu CPF'}).click();
  await expect.poll(()=>f.batches.flatMap(batch=>batch.events).some(event=>event.name==='access_unavailable')).toBe(true);
  const events=f.batches.flatMap(batch=>batch.events);expect(events.some(event=>event.name==='document_completed')).toBe(true);
  expect(JSON.stringify(f.batches)).not.toContain('52998224725');expect(JSON.stringify(f.batches)).not.toContain('529.982.247-25');
  await page.getByRole('button',{name:'Preferências de estatísticas'}).click();
  await page.getByRole('button',{name:'Recusar estatísticas'}).click();
  expect(await page.evaluate(()=>localStorage.getItem('leal_analytics_block'))).toBe('1');
});
test('refusal leaves access usable; preference panel has no detected accessibility violations',async({page})=>{
  const f=await mockAnalytics(page);await page.goto('/');
  await expect(page.getByRole('button',{name:'Recusar estatísticas'})).toBeVisible();
  expect((await new AxeBuilder({page}).include('.analytics-preferences').withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await page.getByRole('button',{name:'Recusar estatísticas'}).click();
  await page.getByLabel('Seu CPF',{exact:true}).fill('52998224725');await page.getByRole('button',{name:'Continuar com meu CPF'}).click();
  await expect(page.locator('#access-error')).toBeVisible();expect(f.starts()).toBe(0);expect(f.batches).toHaveLength(0);
});
