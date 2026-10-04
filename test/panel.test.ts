import assert from 'node:assert/strict';
import {panelSignature,validPanelToken,createCheckoutHandler} from '../supabase/functions/checkout-api/index';
import {addBusinessDays} from '../src/lib/delivery';
const secret='test-only-secret',expires=Date.now()+1800000,value=expires+'.'+crypto.randomUUID();
const token=value+'.'+await panelSignature(value,secret);
assert.equal(await validPanelToken(token,secret),true);
assert.equal(await validPanelToken(token+'x',secret),false);
assert.equal(await validPanelToken(token,'other-secret'),false);
assert.equal(await validPanelToken(token,secret,expires+1),false);
assert.equal(await validPanelToken(token,''),false);
const handler=createCheckoutHandler({supabaseClient:{}});
assert.equal((await handler(new Request('https://example.com/panel/stats'))).status,401);
assert.equal((await handler(new Request('https://example.com/analytics/event',{method:'POST',body:JSON.stringify({event:'paid',visitor:crypto.randomUUID()})}))).status,400);
assert.equal((await handler(new Request('https://example.com/analytics/copy',{method:'POST',body:'{}'}))).status,400);
assert.equal(addBusinessDays(new Date(2026,9,9,12),2).getDate(),14); // weekend + Oct 12 national holiday
assert.equal(addBusinessDays(new Date(2026,3,2,12),1).getDate(),6); // Good Friday + weekend
console.log('Painel: assinatura, expiração, acesso privado, eventos falsos, cópia sem autorização e calendário de entrega aprovados.');
