export const PIXEL_ID = '1641693707389160';
declare global { interface Window { fbq?: any; _fbq?: any; } }
export function marketingAllowed() { try { return localStorage.getItem('landy_marketing') === 'yes'; } catch { return false; } }
function cookie(name:string) { return document.cookie.split('; ').find(x=>x.startsWith(name+'='))?.slice(name.length+1); }
export function trackingContext() {
 if (!marketingAllowed()) return { consent:false };
 return {consent:true,fbp:cookie('_fbp'),fbc:cookie('_fbc'),userAgent:navigator.userAgent};
}
export function startPixel() {
 if (!marketingAllowed() || window.fbq) return;
 const q:any=function(...args:any[]) { q.callMethod ? q.callMethod(...args) : q.queue.push(args); };
 q.queue=[]; q.loaded=true; q.version='2.0'; window.fbq=q; window._fbq=q;
 q('consent','grant'); q('init',PIXEL_ID);
 const click=new URL(location.href).searchParams.get('fbclid');
 if(click&&/^[A-Za-z0-9_.-]{1,300}$/.test(click))document.cookie='_fbc=fb.1.'+Date.now()+'.'+click+'; Max-Age=7776000; Path=/; SameSite=Lax; Secure';
 const s=document.createElement('script'); s.async=true; s.src='https://connect.facebook.net/en_US/fbevents.js'; document.head.appendChild(s);
 q('track','PageView'); track('ViewContent',{content_ids:['kit-depilador'],content_type:'product',currency:'BRL',value:34.90});
}
export function track(name:string,data:Record<string,unknown>,id?:string) {
 if (!marketingAllowed() || !window.fbq) return;
 window.fbq('track',name,data,{eventID:id||crypto.randomUUID()});
}
export function trackPurchase(orderId:string,value:number) {
 if (!marketingAllowed() || !orderId || !window.fbq || !Number.isFinite(value) || value<=0) return;
 const id='purchase_'+orderId;
 try { if(localStorage.getItem(id))return; track('Purchase',{currency:'BRL',value},id); localStorage.setItem(id,'1'); } catch { track('Purchase',{currency:'BRL',value},id); }
}
export function chooseMarketing(allow:boolean) {
 try {localStorage.setItem('landy_marketing',allow?'yes':'no');} catch {}
 if(allow){window.fbq?.('consent','grant');startPixel();} else { window.fbq?.('consent','revoke'); for(const n of ['_fbp','_fbc'])document.cookie=n+'=; Max-Age=0; Path=/; SameSite=Lax'; }
 window.dispatchEvent(new Event('landy-consent'));
}
