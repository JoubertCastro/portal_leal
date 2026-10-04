import {test,expect} from '@playwright/test';
test('WhatsApp selection requires authorization and never defaults communications opt-in',async({page})=>{
  const selected='a'.repeat(43);let sent=false;
  await page.route('**/api/auth/challenges',async route=>{
    const body=route.request().postDataJSON();
    if(!body.action){await route.fulfill({json:{available:true}});return;}
    if(body.action==='prepare'){
      expect(body.document.replace(/\D/g,'')).toBe('52998224725');
      await route.fulfill({json:{kind:'select_phone',selectionId:'b'.repeat(43),noticeVersion:'test',options:[{id:selected,label:'+55 (••) •••••-9999'}]}});return;
    }
    expect(body).toMatchObject({action:'send',optionId:selected,authentication:true,communications:false});expect(body.phone).toBeUndefined();
    sent=true;await route.fulfill({json:{challengeId:'c'.repeat(43)}});
  });
  await page.route('**/api/auth/verify',async route=>{expect(route.request().postDataJSON()).toMatchObject({code:'654321'});await route.fulfill({status:401,json:{error:{message:'Código inválido ou expirado.'}}});});
  await page.goto('/');await page.getByLabel('Seu CPF',{exact:true}).fill('52998224725');await page.getByRole('button',{name:'Continuar com meu CPF'}).click();
  await page.getByLabel('Em qual WhatsApp deseja receber o código?').selectOption(selected);
  const auth=page.getByRole('checkbox',{name:'Quero receber um código',exact:false});
  const comm=page.getByRole('checkbox',{name:'Quero receber também',exact:false});
  await expect(auth).not.toBeChecked();await expect(comm).not.toBeChecked();
  await auth.check();await page.getByRole('button',{name:'Receber código no WhatsApp'}).click();
  await expect(page.getByLabel('Código recebido no WhatsApp')).toBeVisible();expect(sent).toBe(true);
  await page.getByLabel('Código recebido no WhatsApp').fill('654321');await page.getByRole('button',{name:'Confirmar e acessar'}).click();
  await expect(page.getByText('Código inválido ou expirado.',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
