import {test,expect} from '@playwright/test';
test('retired pages and homologation API are inaccessible',async({request})=>{
 for(const path of ['/demonstracao','/homologacao'])expect((await request.get(path)).status()).toBe(404);
 expect((await request.post('/api/homologacao/consulta',{data:{}})).status()).toBe(410);
});
