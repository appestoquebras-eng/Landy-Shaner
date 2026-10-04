import React,{useEffect,useState} from 'react';
import {chooseMarketing,startPixel} from '../lib/meta';
export function MarketingConsent(){
 const [open,setOpen]=useState(()=>{try{return !localStorage.getItem('landy_marketing');}catch{return true;}});
 useEffect(()=>{startPixel();},[]);
 const choose=(v:boolean)=>{chooseMarketing(v);setOpen(false);};
 return <><button className="fixed bottom-24 left-2 z-50 rounded bg-white border px-2 py-1 text-xs text-gray-700" onClick={()=>setOpen(true)}>Privacidade</button>{open&&<div role="dialog" aria-label="Preferências de privacidade" className="fixed bottom-0 left-0 right-0 z-[100] bg-white border-t shadow-xl p-4 text-gray-900"><p className="text-sm mb-3">Você permite cookies da Meta e o compartilhamento de dados de navegação e compras para medir nossos anúncios? Email e telefone, quando informados, são enviados com hash. Você pode recusar e comprar normalmente ou mudar sua escolha em Privacidade.</p><div className="flex gap-3"><button onClick={()=>choose(false)} className="border rounded px-4 py-2">Recusar</button><button onClick={()=>choose(true)} className="bg-pink-700 text-white rounded px-4 py-2">Aceitar</button></div></div>}</>;
}
