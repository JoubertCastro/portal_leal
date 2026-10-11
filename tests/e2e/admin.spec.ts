import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('administrator setup, second factor, reports and logout are separate stages',async({page})=>{
 let stage='login';let reads=0;
 await page.route('**/api/admin/auth',async route=>{if(route.request().method()==='POST'){const body=route.request().postDataJSON();stage=body.action==='login'?'setup':body.action==='verify'?'verified':body.action==='logout'?'login':'otp';}await route.fulfill({json:{stage,phone:stage==='otp'?'(**) *****-9999':null}});});
 await page.route('**/api/admin/reports?*',async route=>{reads++;await route.fulfill({json:{columns:['day','consented_journeys','found','simulated','human_handoff'],rows:[{day:'2026-10-11',consented_journeys:40,found:18,simulated:12,human_handoff:3}],page:1,hasMore:false,summary:{consented_journeys:40,submitted:20,found:18,with_debts:15,simulated:12,negotiated:4,human_handoff:3}}});});
 await page.goto('/admin');await page.getByLabel('Usuário',{exact:true}).fill('admin');await page.getByLabel('Senha',{exact:true}).fill('admin');await page.getByRole('button',{name:'Continuar',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Configure seu acesso'})).toBeVisible();expect(reads).toBe(0);
 await page.getByLabel('Nova senha',{exact:true}).fill('synthetic-password');await page.getByLabel('Repita a nova senha').fill('synthetic-password');await page.getByLabel('Seu WhatsApp com DDD').fill('11999999999');await page.getByRole('button',{name:'Enviar código e continuar'}).click();
 await expect(page.getByRole('heading',{name:'Confirme sua identidade'})).toBeVisible();expect(reads).toBe(0);
 await page.getByLabel('Código de seis dígitos').fill('123456');await page.getByRole('button',{name:'Confirmar e acessar'}).click();await expect(page.getByRole('heading',{name:'Funil de clientes'})).toBeVisible();await expect(page.getByRole('table')).toBeVisible();
 expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`test-results/admin-${test.info().project.name}.png`,fullPage:true});
 await page.getByRole('button',{name:'Chamadas de API',exact:true}).click();await expect(page.getByLabel('Provedor')).toBeVisible();
 await page.getByRole('button',{name:'Sair',exact:true}).click();await expect(page.getByLabel('Usuário',{exact:true})).toBeVisible();await expect(page.getByRole('table')).toHaveCount(0);
});
test('admin endpoints reject customer or missing sessions and cross-origin authentication',async({request})=>{
 expect((await request.get('/api/admin/reports?report=funnel&from=2026-10-01&to=2026-10-12')).status()).toBe(401);
 expect((await request.post('/api/admin/auth',{headers:{Origin:'https://untrusted.example'},data:{action:'login',username:'admin',password:'admin'}})).status()).toBe(403);
});
