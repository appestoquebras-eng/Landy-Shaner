import React, {useEffect, useRef, useState} from 'react';
import {MessageCircle, X, ChevronLeft, ChevronRight, ZoomIn} from 'lucide-react';
import {CUSTOMER_PHOTOS, CUSTOMER_REVIEWS} from '../data/customerReviews';

export const TestimonialsSection: React.FC<{checkout?: boolean}> = ({checkout = false}) => {
  const [expanded, setExpanded] = useState(false);
  const [photo, setPhoto] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (photo !== null && !dialog.current?.open) dialog.current?.showModal();
    if (photo === null && dialog.current?.open) {dialog.current.close(); opener.current?.focus();}
  }, [photo]);
  const move = (delta: number) => setPhoto(current => current === null ? null : (current + delta + CUSTOMER_PHOTOS.length) % CUSTOMER_PHOTOS.length);
  return (
    <section id={checkout ? 'checkout-avaliacoes' : 'avaliacoes'} className="bg-background py-12 sm:py-16 border-t border-border/60">
      <div className="mx-auto max-w-6xl px-4">
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-xs font-bold text-primary"><MessageCircle size={15}/> Experiências de quem recebeu</span>
          <h2 className="mt-4 font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">O que elas dizem sobre a compra</h2>
          <p className="mt-3 text-sm text-muted-foreground">Comentários e fotos compartilhados pelas nossas clientes.</p>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CUSTOMER_REVIEWS.slice(0, expanded ? undefined : 6).map(([name, text], i) => (
            <article key={name} className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm">
              <button type="button" onClick={event => {opener.current = event.currentTarget; setPhoto(i);}} aria-label={`Ampliar foto ${i + 1} do kit recebido`} className="group relative mb-5 h-52 w-full overflow-hidden rounded-xl border border-border bg-background focus-visible:outline-2 focus-visible:outline-primary"><img src={CUSTOMER_PHOTOS[i]} alt={`Foto ${i + 1} do kit e embalagem`} loading="lazy" decoding="async" className="h-full w-full object-contain transition-transform group-hover:scale-105"/><span aria-hidden="true" className="absolute bottom-2 right-2 rounded-full bg-black/55 p-1.5 text-white"><ZoomIn size={16}/></span></button>
              <p className="text-sm leading-relaxed text-foreground/90">“{text}”</p>
              <div className="mt-5 flex items-center gap-3 border-t border-border/60 pt-4"><span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-primary font-bold">{name[0]}</span><p className="text-sm font-bold">{name}</p></div>
            </article>
          ))}
        </div>
        <div className="mt-6 text-center"><button type="button" onClick={() => setExpanded(!expanded)} className="rounded-full border border-primary/25 bg-card px-6 py-3 text-sm font-bold text-primary hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary">{expanded ? 'Mostrar menos avaliações' : 'Ver todas as 18 avaliações'}</button></div>
        <dialog ref={dialog} aria-label="Foto ampliada do produto" onCancel={() => setPhoto(null)} onClose={() => setPhoto(null)} onClick={event => {if (event.target === event.currentTarget) setPhoto(null);}} onKeyDown={event => {if (event.key === 'ArrowRight') move(1); if (event.key === 'ArrowLeft') move(-1);}} className="m-auto max-h-[94dvh] w-[min(94vw,800px)] rounded-2xl bg-card p-3 text-foreground shadow-xl backdrop:bg-black/75">
          {photo !== null && <><div className="flex items-center justify-between pb-2"><p className="text-sm font-bold">Foto {photo + 1} de 18</p><button autoFocus type="button" aria-label="Fechar foto" onClick={() => setPhoto(null)} className="rounded-full p-2 hover:bg-secondary"><X size={22}/></button></div><img src={CUSTOMER_PHOTOS[photo]} alt={`Foto ${photo + 1} ampliada do kit e embalagem`} className="mx-auto max-h-[70dvh] max-w-full object-contain"/><div className="mt-3 flex justify-between"><button type="button" aria-label="Foto anterior" onClick={() => move(-1)} className="flex items-center gap-1 rounded-full bg-secondary px-4 py-2 text-sm font-bold"><ChevronLeft size={18}/>Anterior</button><button type="button" aria-label="Próxima foto" onClick={() => move(1)} className="flex items-center gap-1 rounded-full bg-secondary px-4 py-2 text-sm font-bold">Próxima<ChevronRight size={18}/></button></div></>}
        </dialog>
      </div>
    </section>
  );
};
