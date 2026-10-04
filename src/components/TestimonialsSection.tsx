import React from 'react';
import { Star, BadgeCheck } from 'lucide-react';
import { TESTIMONIALS } from '../data/landingData';

export const TestimonialsSection: React.FC = () => {
  return (
    <section className="bg-background py-14 sm:py-20 border-t border-border/60">
      <div className="mx-auto max-w-6xl px-4">
        <div className="text-center">
          <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl text-foreground">
            Elas amaram — <span className="text-primary">e você também vai</span>
          </h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            Avaliações de clientes que já receberam o kit em casa.
          </p>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {TESTIMONIALS.map((item, idx) => (
            <div
              key={idx}
              className="flex flex-col justify-between rounded-3xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-md"
            >
              <div>
                <div className="flex items-center gap-1 text-gold">
                  {[...Array(item.stars)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-gold text-gold" />
                  ))}
                </div>
                <p className="mt-4 text-sm leading-relaxed text-foreground/90">
                  “{item.text}”
                </p>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-border/60 pt-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold bg-secondary text-secondary-foreground">
                    {item.initial}
                  </span>
                  <div>
                    <p className="text-sm font-bold text-foreground">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.city}</p>
                  </div>
                </div>

                <span className="flex items-center gap-1 text-[11px] font-bold text-primary">
                  <BadgeCheck className="h-4 w-4" /> Compra verificada
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
