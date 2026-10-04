import React from 'react';
import { Star, CheckCircle2 } from 'lucide-react';

interface HeroSectionProps {
  onCtaClick: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onCtaClick }) => {
  return (
    <section className="relative overflow-hidden bg-background">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-10 sm:py-14 lg:grid-cols-2 lg:py-20">
        <div className="flex flex-col items-start text-left">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-primary">
            Kit Depilador Elétrico 4 em 1 Multifuncional
          </span>

          <h1 className="mt-5 font-display text-3xl font-extrabold leading-[1.12] tracking-tight text-foreground sm:text-5xl">
            Beleza completa <span className="text-primary">da cabeça aos pés</span> em um só aparelho
          </h1>

          <p className="mt-4 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
            Depila, apara, modela e cuida: axilas, áreas íntimas, rosto, sobrancelhas, buço e nariz — sem dor, sem irritação e sem sair de casa.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 text-gold">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="h-4 w-4 fill-gold text-gold" />
              ))}
            </div>
            <p className="text-xs font-semibold text-muted-foreground sm:text-sm">
              <strong className="text-foreground">4,9/5</strong> · mais de 12.000 kits entregues em todo o Brasil
            </p>
          </div>

          <div className="mt-7 w-full sm:w-auto">
            <button
              onClick={onCtaClick}
              type="button"
              className="cta-grad w-full sm:w-auto rounded-2xl px-8 py-4 text-base sm:text-lg font-extrabold uppercase tracking-wide text-primary-foreground shadow-xl shadow-primary/30 transition-transform hover:scale-[1.02] active:scale-95 cursor-pointer text-center"
            >
              Quero o meu com frete grátis →
            </button>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-4 text-xs font-bold text-muted-foreground">
            <span className="inline-flex items-center gap-1 text-emerald-600">
              <CheckCircle2 className="h-4 w-4" /> Frete Grátis
            </span>
            <span className="inline-flex items-center gap-1 text-emerald-600">
              <CheckCircle2 className="h-4 w-4" /> Garantia de 30 Dias
            </span>
            <span className="inline-flex items-center gap-1 text-emerald-600">
              <CheckCircle2 className="h-4 w-4" /> Envio em 24h
            </span>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-md lg:max-w-none order-first lg:order-last">
          <div className="rounded-3xl border border-primary/20 bg-card p-3 shadow-2xl shadow-primary/10">
            <div className="overflow-hidden rounded-2xl bg-secondary/30">
              <img
                src="/images/kit-produto-completo.webp"
                alt="Kit 4 em 1 Beleza Completa — aparelho de depilação com cabeças intercambiáveis"
                className="w-full rounded-2xl object-cover transition-transform hover:scale-[1.01]"
                loading="eager"
              />
            </div>
            <div className="mt-3 rounded-2xl border border-border/80 bg-secondary/40 p-3.5 shadow-sm text-center sm:text-left">
              <p className="text-xs font-extrabold text-foreground sm:text-sm">
                4 Cabeças Intercambiáveis de Alta Precisão
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Corpo, rosto, sobrancelha e nariz em uma única base recarregável
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
