export const PIXEL_ID = '1641693707389160';
declare global { interface Window { fbq?: any; _fbq?: any; } }
export function marketingAllowed() { try { return localStorage.getItem('landy_marketing') === 'yes'; } catch { return false; } }
const landingClick = new URL(location.href).searchParams.get('fbclid');
function captureClick() {
 if (!marketingAllowed() || !landingClick || !/^[A-Za-z0-9_.-]{1,300}$/.test(landingClick)) return;
 const existing = cookie('_fbc');
 if (!existing || !existing.endsWith('.'+landingClick)) document.cookie='_fbc=fb.1.'+Date.now()+'.'+landingClick+'; Max-Age=7776000; Path=/; SameSite=Lax; Secure';
}
function cookie(name:string) { return document.cookie.split('; ').find(x=>x.startsWith(name+'='))?.slice(name.length+1); }
export function trackingContext() {
 // Automatic browser tracking is not explicit permission to send contact data.
 try { if (localStorage.getItem('landy_marketing') !== 'yes') return {consent:false}; } catch { return {consent:false}; }
 captureClick();
 return {consent:true,fbp:cookie('_fbp'),fbc:cookie('_fbc'),userAgent:navigator.userAgent};
}
export function startPixel() {
 if (!marketingAllowed()) return;
 captureClick();
 if (window.fbq) return;
 const q:any=function(...args:any[]) { q.callMethod ? q.callMethod(...args) : q.queue.push(args); };
 q.queue=[]; q.loaded=true; q.version='2.0'; window.fbq=q; window._fbq=q;
 q('consent','grant'); q('init',PIXEL_ID);
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
 try { if(localStorage.getItem(id))return; } catch {}
 track('Purchase',{currency:'BRL',value,order_id:orderId},id);
 try { localStorage.setItem(id,'1'); } catch {}
}
export function chooseMarketing(allow:boolean) {
 try {localStorage.setItem('landy_marketing',allow?'yes':'no');} catch {}
 if(allow){window.fbq?.('consent','grant');startPixel();} else { window.fbq?.('consent','revoke'); for(const n of ['_fbp','_fbc'])document.cookie=n+'=; Max-Age=0; Path=/; SameSite=Lax'; }
 window.dispatchEvent(new Event('landy-consent'));
}
