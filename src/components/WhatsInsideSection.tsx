import React from 'react';
import { BODY_AREAS } from '../data/landingData';

export const WhatsInsideSection: React.FC = () => {
  return (
    <section className="bg-background py-14 sm:py-20 border-t border-border/60">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="text-center font-display text-3xl font-extrabold tracking-tight sm:text-4xl text-foreground">
          Tudo o que vem no <span className="text-primary">seu Kit 4 em 1</span>
        </h2>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm md:col-span-2 flex flex-col">
            <img
              src="/images/kit-conteudo.webp"
              alt="Tudo o que acompanha o Kit 4 em 1"
              className="w-full object-cover md:h-full transition-transform hover:scale-[1.01]"
            />
            <p className="border-t border-border/60 px-5 py-4 text-sm font-semibold text-foreground">
              4 cabeças intercambiáveis · <span className="text-muted-foreground">tudo o que você precisa em um kit só</span>
            </p>
          </div>

          <div className="flex flex-col gap-5">
            <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
              <img
                src="/images/kit-na-mao.jpg"
                alt="Foto real do aparelho na mão"
                className="w-full object-cover md:aspect-square transition-transform hover:scale-[1.02]"
              />
            </div>
            <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
              <img
                src="/images/kit-multifuncional.webp"
                alt="As quatro funções do aparelho"
                className="w-full object-cover transition-transform hover:scale-[1.02]"
              />
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {BODY_AREAS.map((area, idx) => (
            <span
              key={idx}
              className="rounded-full border border-border bg-card px-5 py-2 text-sm font-bold text-foreground shadow-sm hover:border-primary/50 transition-colors"
            >
              ✓ {area}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
};
