import assert from 'node:assert/strict';
import {calculateOrderAmounts} from '../supabase/functions/checkout-api/index';
import {kitTotal} from '../src/data/landingData';
for(let quantity=1;quantity<=10;quantity++)for(const cream of [false,true]){
 const r=calculateOrderAmounts(quantity,cream);
 assert.equal(r.amountCents,quantity*(quantity>=2?3141:3490)+(cream?1500:0));
 assert.equal(r.amountReais,Number((kitTotal(quantity)+(cream?15:0)).toFixed(2)));
 assert.equal(Math.round(r.items.reduce((s,i)=>s+i.quantity*i.price,0)*100),r.amountCents);
}
assert.equal(calculateOrderAmounts(1,false).amountCents,3490);
assert.equal(calculateOrderAmounts(2,false).amountCents,6282);
assert.equal(calculateOrderAmounts(2,true).amountCents,7782);
console.log('Desconto: quantidades 1 a 10, com/sem clareador, itens do gateway e total em centavos aprovados.');
