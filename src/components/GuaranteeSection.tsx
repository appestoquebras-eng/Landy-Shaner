import React from 'react';
import { Shield } from 'lucide-react';

export const GuaranteeSection: React.FC = () => {
  return (
    <section className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-col items-center gap-5 rounded-3xl border border-primary/20 bg-primary/5 p-8 text-center sm:flex-row sm:text-left shadow-sm">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25">
          <Shield className="h-8 w-8" />
        </span>
        <div>
          <h3 className="font-display text-2xl font-extrabold text-foreground">
            Garantia incondicional de 30 dias
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Use o kit por 30 dias. Se não amar o resultado, devolvemos 100% do seu dinheiro — sem perguntas e sem letras miúdas.
          </p>
        </div>
      </div>
    </section>
  );
};
