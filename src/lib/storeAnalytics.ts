const base = (import.meta.env.VITE_CHECKOUT_API_URL || '').replace(/\/$/, '');
export function recordStoreEvent(event: 'visit' | 'checkout') {
  if (!base || location.pathname === '/painel') return;
  try {
    let visitor = localStorage.getItem('landy_visitor');
    if (!visitor) { visitor = crypto.randomUUID(); localStorage.setItem('landy_visitor', visitor); }
    void fetch(base + '/analytics/event', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({event, visitor}), keepalive:true}).catch(()=>{});
  } catch {}
}
export async function recordPixCopy(orderId:string, token:string) {
  if (base) await fetch(base+'/analytics/copy', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderId, token}),keepalive:true}).catch(()=>{});
}
export async function panelRequest(path:string, data?:unknown, token?:string) {
  const res=await fetch(base+'/panel/'+path,{method:data?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(data?{body:JSON.stringify(data)}:{})});
  const result=await res.json();
  if(!res.ok)throw new Error(result.error||'Não foi possível carregar o painel.');
  return result;
}
