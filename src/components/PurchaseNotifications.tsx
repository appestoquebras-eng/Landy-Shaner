import {useEffect,useState} from 'react';
import {ShoppingBag,X} from 'lucide-react';
// Historical purchases supplied by the store owner, with permission for public display.
const purchases = [
 ['Gabriela S.','São Paulo, SP',2],['Mariana L.','Curitiba, PR',1],
 ['Fernanda M.','Rio de Janeiro, RJ',2],['Juliana A.','Belo Horizonte, MG',1],
 ['Camila R.','Salvador, BA',2],['Amanda C.','Goiânia, GO',1],
 ['Beatriz F.','Campinas, SP',2],['Larissa P.','Recife, PE',1],
 ['Letícia G.','Fortaleza, CE',2],['Bruna T.','Brasília, DF',1],
 ['Vitória N.','Porto Alegre, RS',2],['Isabela D.','Manaus, AM',1],
 ['Carolina V.','Sorocaba, SP',2],['Natália B.','Florianópolis, SC',1],
 ['Bianca H.','Londrina, PR',2],['Daniela E.','Ribeirão Preto, SP',1],
 ['Renata J.','Belém, PA',2],['Aline K.','Campo Grande, MS',1],
 ['Priscila O.','São Luís, MA',2],['Débora W.','João Pessoa, PB',1],
 ['Vanessa Q.','Uberlândia, MG',2],['Patrícia I.','Maceió, AL',1],
 ['Raquel Z.','Natal, RN',2],['Nicole S.','Joinville, SC',1],
 ['Michele L.','São José dos Campos, SP',2],['Tainá M.','Vitória, ES',1],
 ['Eduarda R.','Cuiabá, MT',2],['Yasmin C.','Santos, SP',1],
 ['Jéssica P.','Aracaju, SE',2],['Luana F.','Niterói, RJ',1]
] as const;
export function PurchaseNotifications(){
 const [duration,setDuration]=useState(7000);
 const [index,setIndex]=useState(0),[visible,setVisible]=useState(false),[closed,setClosed]=useState(()=>{try{return sessionStorage.getItem('landy_hide_purchase_notices')==='yes';}catch{return false;}});
 useEffect(()=>{
  if(closed)return;
  let timer:ReturnType<typeof setTimeout>;
  let next=0;
  const show=()=>{
   if(document.hidden||document.querySelector('[role="dialog"]')||document.activeElement?.matches('input,textarea,select')){timer=setTimeout(show,6000);return;}
   const display=6000+Math.floor(Math.random()*3000);setDuration(display);setIndex(next);next=(next+1)%purchases.length;setVisible(true);
   timer=setTimeout(()=>{setVisible(false);timer=setTimeout(show,18000+Math.floor(Math.random()*15000));},display);
  };
  timer=setTimeout(show,6000);
  const hide=(event:FocusEvent)=>{if(event.target instanceof HTMLElement&&event.target.matches('input,textarea,select'))setVisible(false);};
  window.addEventListener('focusin',hide);
  return()=>{clearTimeout(timer);window.removeEventListener('focusin',hide);};
 },[closed]);
 const close=()=>{setClosed(true);setVisible(false);try{sessionStorage.setItem('landy_hide_purchase_notices','yes');}catch{}};
 if(!visible||closed)return null;
 const [name,city,quantity]=purchases[index];
 return <aside aria-label="Compra anterior de cliente" style={{animation:`purchase-notice ${duration}ms ease both`}} className="purchase-notice fixed top-20 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-96 z-40 rounded-2xl border border-primary/15 bg-white shadow-lg p-4 flex gap-3 text-foreground">
  <div className="h-11 w-11 shrink-0 rounded-xl bg-secondary flex items-center justify-center"><ShoppingBag size={23} className="text-primary"/></div>
  <div className="min-w-0 pr-4"><p className="text-sm font-bold mt-1">{name}</p><p className="text-xs text-muted-foreground mt-0.5">{city}</p><p className="text-xs mt-2">Comprou <strong>{quantity} {quantity===1?'unidade':'unidades'}</strong> do Kit 4 em 1</p></div>
  <button type="button" onClick={close} aria-label="Fechar notificações de compras" className="absolute right-2 top-2 p-1 rounded-full text-muted-foreground hover:bg-muted"><X size={16}/></button>
 </aside>;
}



